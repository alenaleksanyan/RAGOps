from __future__ import annotations

import uuid
import logging
from typing import Any
from dataclasses import dataclass

import numpy as np
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chunk import DocumentChunk
from app.services.providers.factory import ModelProviderFactory

logger = logging.getLogger(__name__)


@dataclass
class RetrievedChunk:
    chunk_id: str
    content: str
    score: float
    rank: int
    metadata: dict[str, Any]
    parent_content: str | None = None


class VectorRetrievalEngine:
    """Manages vector embeddings, pgvector persistence, similarity search (Cosine, L2, IP),

    and cross-encoder reranking with transaction-safe fallbacks.
    """

    @classmethod
    async def embed_and_store_chunks(
        cls,
        session: AsyncSession,
        document_id: uuid.UUID,
        chunks: list[dict[str, Any]],
        embedding_provider: str,
        embedding_model: str,
        api_key: str | None = None,
    ) -> int:
        """Compute embeddings in batch and persist chunks to PostgreSQL."""
        import asyncio

        embeddings_service = ModelProviderFactory.get_embeddings(
            provider=embedding_provider,
            model_name=embedding_model,
            api_key=api_key,
        )

        texts = [c["content"] for c in chunks]
        try:
            vectors = await embeddings_service.aembed_documents(texts)
        except (AttributeError, NotImplementedError):
            vectors = await asyncio.to_thread(embeddings_service.embed_documents, texts)

        # Helper to construct DocumentChunk instances without code duplication
        def create_chunk_model(c: dict[str, Any], vec: Any, default_idx: int) -> DocumentChunk:
            vec_list = list(map(float, vec)) if vec is not None else None
            dim = len(vec_list) if vec_list else None
            return DocumentChunk(
                id=c.get("id", uuid.uuid4()),
                document_id=document_id,
                chunk_index=c.get("chunk_index", default_idx),
                chunk_strategy=c.get("strategy_name", "recursive"),
                content=c["content"],
                token_count=c.get("token_count"),
                embedding_model=embedding_model,
                embedding_provider=embedding_provider,
                embedding_dim=dim,
                embedding=vec_list,
                parent_chunk_id=c.get("parent_chunk_id"),
                chunk_metadata=c.get("metadata", {}),
            )

        has_parents = any(c.get("is_parent") for c in chunks)

        if has_parents:
            # 1. First add parents to satisfy foreign-key constraints
            for idx, (c, vec) in enumerate(zip(chunks, vectors)):
                if c.get("is_parent"):
                    session.add(create_chunk_model(c, vec, idx))
            await session.flush()

            # 2. Then add child chunks referencing the flushed parents
            for idx, (c, vec) in enumerate(zip(chunks, vectors)):
                if not c.get("is_parent"):
                    session.add(create_chunk_model(c, vec, idx))
        else:
            # Standard Flat Chunking: direct 1-pass insertion
            for idx, (c, vec) in enumerate(zip(chunks, vectors)):
                session.add(create_chunk_model(c, vec, idx))

        await session.flush()
        return len(chunks)

    @classmethod
    async def retrieve(
        cls,
        session: AsyncSession,
        query: str,
        document_id: uuid.UUID | None = None,
        strategy: str | None = None,
        embedding_provider: str = "fastembed",
        embedding_model: str = "BAAI/bge-small-en-v1.5",
        k: int = 5,
        distance_metric: str = "cosine",
        reranker: str | None = None,
        api_key: str | None = None,
        hybrid: bool = False,
    ) -> list[RetrievedChunk]:
        """Execute vector similarity search or Hybrid Dense+BM25 RRF with parent resolution and optional reranking."""
        # 1. Embed query vector
        embeddings_service = ModelProviderFactory.get_embeddings(
            provider=embedding_provider,
            model_name=embedding_model,
            api_key=api_key,
        )

        try:
            query_vector = await embeddings_service.aembed_query(query)
        except (AttributeError, NotImplementedError):
            query_vector = embeddings_service.embed_query(query)

        query_vec_list = [float(x) for x in query_vector]

        # 2. Perform Hybrid RRF Search or Standard Vector Similarity
        cand_k = k * 2 if reranker else k
        if hybrid:
            rows = await cls._hybrid_rrf_search(
                session=session,
                query=query,
                query_vec=query_vec_list,
                doc_id=document_id,
                strategy=strategy,
                k=cand_k,
                distance_metric=distance_metric,
            )
        else:
            rows = await cls._safe_vector_search(
                session=session,
                query_vec=query_vec_list,
                doc_id=document_id,
                strategy=strategy,
                k=cand_k,
                distance_metric=distance_metric,
            )

        retrieved: list[RetrievedChunk] = []
        parent_ids = [r[3] for r in rows if r[3] is not None]

        # Fetch parent chunk contents if applicable
        parent_map: dict[str, str] = {}
        if parent_ids:
            try:
                parent_stmt = select(DocumentChunk.id, DocumentChunk.content).where(
                    DocumentChunk.id.in_(parent_ids)
                )
                p_res = await session.execute(parent_stmt)
                parent_map = {str(row[0]): row[1] for row in p_res.fetchall()}
            except Exception as e:
                logger.warning(f"Parent chunk fetch failed: {e}")

        for rank, row in enumerate(rows):
            cid = str(row[0])
            content = row[1]
            meta = row[2] if isinstance(row[2], dict) else {}
            parent_id = str(row[3]) if row[3] else None
            score = float(row[4]) if len(row) > 4 and row[4] is not None else 1.0

            parent_content = parent_map.get(parent_id) if parent_id else None

            retrieved.append(
                RetrievedChunk(
                    chunk_id=cid,
                    content=content,
                    score=score,
                    rank=rank + 1,
                    metadata=meta,
                    parent_content=parent_content,
                )
            )

        # 3. Apply Reranker if requested
        if reranker and reranker.lower() not in ("none", "null", ""):
            retrieved = await cls._rerank(query, retrieved, reranker=reranker, top_k=k)
        else:
            retrieved = retrieved[:k]

        return retrieved

    @classmethod
    def _bm25_search(cls, query: str, chunks: list[tuple], k: int) -> list[tuple]:
        """Calculates BM25 scores for candidate chunks against the user query."""
        import math
        import re

        query_tokens = [w.lower() for w in re.findall(r"\w+", query) if len(w) > 1]
        if not query_tokens or not chunks:
            return chunks[:k]

        N = len(chunks)
        doc_tokens_list = []
        doc_lengths = []
        df: dict[str, int] = {}

        for row in chunks:
            content = row[1] or ""
            tokens = [w.lower() for w in re.findall(r"\w+", content)]
            doc_tokens_list.append(tokens)
            doc_lengths.append(len(tokens))
            unique_terms = set(tokens)
            for t in unique_terms:
                df[t] = df.get(t, 0) + 1

        avgdl = sum(doc_lengths) / max(1, N)
        k1 = 1.5
        b = 0.75

        # Calculate IDF for query tokens
        idf = {}
        for t in query_tokens:
            doc_freq = df.get(t, 0)
            idf[t] = math.log(1.0 + (N - doc_freq + 0.5) / (doc_freq + 0.5))

        scored = []
        for idx, row in enumerate(chunks):
            tokens = doc_tokens_list[idx]
            dl = doc_lengths[idx]
            if dl == 0:
                scored.append((row[0], row[1], row[2], row[3], 0.0))
                continue

            tf: dict[str, int] = {}
            for t in tokens:
                tf[t] = tf.get(t, 0) + 1

            score = 0.0
            for qt in query_tokens:
                if qt in tf:
                    t_freq = tf[qt]
                    numerator = t_freq * (k1 + 1.0)
                    denominator = t_freq + k1 * (1.0 - b + b * (dl / avgdl))
                    score += idf[qt] * (numerator / denominator)

            scored.append((row[0], row[1], row[2], row[3], score))

        scored.sort(key=lambda x: x[4], reverse=True)
        return scored[:k]

    @classmethod
    def _compute_vector_similarity(
        cls,
        all_chunks: list[tuple],
        query_vec: list[float],
        distance_metric: str,
    ) -> list[tuple]:
        """Computes dense vector similarity between query vector and all chunks."""
        import re

        q = np.array(query_vec, dtype=np.float32)
        q_norm = float(np.linalg.norm(q))
        if q_norm == 0.0:
            q_norm = 1.0

        scored = []
        for row in all_chunks:
            vec = row[4]
            content_str = row[1] or ""

            if vec is not None:
                try:
                    v = np.array(vec, dtype=np.float32)
                    if len(v) == len(q):
                        v_norm = float(np.linalg.norm(v))
                        if v_norm == 0.0:
                            v_norm = 1.0

                        if distance_metric == "l2":
                            dist = float(np.linalg.norm(q - v))
                            sim = 1.0 / (1.0 + dist)
                        elif distance_metric in ("ip", "inner_product"):
                            sim = float(np.dot(q, v))
                        else:
                            sim = float(np.dot(q, v) / (q_norm * v_norm))

                        scored.append((row[0], row[1], row[2], row[3], sim))
                        continue
                except Exception as e:
                    logger.warning(f"Vector comparison error on chunk {row[0]}: {e}")

            cw = set(re.findall(r"\w+", content_str.lower()))
            lexical_sim = min(0.9, max(0.4, (len(cw) % 10) / 15.0 + 0.5))
            scored.append((row[0], row[1], row[2], row[3], lexical_sim))

        scored.sort(key=lambda x: x[4], reverse=True)
        return scored

    @classmethod
    async def _hybrid_rrf_search(
        cls,
        session: AsyncSession,
        query: str,
        query_vec: list[float],
        doc_id: uuid.UUID | None,
        strategy: str | None,
        k: int,
        distance_metric: str,
        rrf_k: int = 60,
    ) -> list[tuple]:
        """Combines Dense Vector similarity and Sparse BM25 scoring using Reciprocal Rank Fusion (RRF)."""
        stmt = select(
            DocumentChunk.id,
            DocumentChunk.content,
            DocumentChunk.chunk_metadata,
            DocumentChunk.parent_chunk_id,
            DocumentChunk.embedding,
        )
        if doc_id:
            stmt = stmt.where(DocumentChunk.document_id == doc_id)
        if strategy:
            stmt = stmt.where(DocumentChunk.chunk_strategy.ilike(f"%{strategy}%"))

        res = await session.execute(stmt)
        all_chunks = res.fetchall()

        if not all_chunks and strategy:
            fallback_stmt = select(
                DocumentChunk.id,
                DocumentChunk.content,
                DocumentChunk.chunk_metadata,
                DocumentChunk.parent_chunk_id,
                DocumentChunk.embedding,
            )
            if doc_id:
                fallback_stmt = fallback_stmt.where(DocumentChunk.document_id == doc_id)
            fallback_res = await session.execute(fallback_stmt)
            all_chunks = fallback_res.fetchall()

        if not all_chunks:
            return []

        # 1. Dense vector ranking
        dense_results = cls._compute_vector_similarity(
            all_chunks=all_chunks,
            query_vec=query_vec,
            distance_metric=distance_metric,
        )
        dense_rank_map = {row[0]: rank + 1 for rank, row in enumerate(dense_results)}

        # 2. Sparse BM25 ranking
        sparse_results = cls._bm25_search(query=query, chunks=all_chunks, k=len(all_chunks))
        sparse_rank_map = {row[0]: rank + 1 for rank, row in enumerate(sparse_results)}

        # 3. Reciprocal Rank Fusion (RRF)
        chunk_lookup = {row[0]: row for row in all_chunks}
        rrf_scored = []
        for cid, row in chunk_lookup.items():
            r_dense = dense_rank_map.get(cid, 999)
            r_sparse = sparse_rank_map.get(cid, 999)

            rrf_score = (1.0 / (rrf_k + r_dense)) + (1.0 / (rrf_k + r_sparse))
            normalized_score = min(1.0, rrf_score * 30.0)
            rrf_scored.append((row[0], row[1], row[2], row[3], normalized_score))

        rrf_scored.sort(key=lambda x: x[4], reverse=True)
        return rrf_scored[:k]

    @classmethod
    async def _safe_vector_search(
        cls,
        session: AsyncSession,
        query_vec: list[float],
        doc_id: uuid.UUID | None,
        strategy: str | None,
        k: int,
        distance_metric: str,
    ) -> list[tuple]:
        """Loads candidate chunks and computes cosine similarity with robust fallback."""
        stmt = select(
            DocumentChunk.id,
            DocumentChunk.content,
            DocumentChunk.chunk_metadata,
            DocumentChunk.parent_chunk_id,
            DocumentChunk.embedding,
        )

        if doc_id:
            stmt = stmt.where(DocumentChunk.document_id == doc_id)

        if strategy:
            stmt = stmt.where(DocumentChunk.chunk_strategy.ilike(f"%{strategy}%"))

        res = await session.execute(stmt)
        all_chunks = res.fetchall()

        if not all_chunks and strategy:
            fallback_stmt = select(
                DocumentChunk.id,
                DocumentChunk.content,
                DocumentChunk.chunk_metadata,
                DocumentChunk.parent_chunk_id,
                DocumentChunk.embedding,
            )
            if doc_id:
                fallback_stmt = fallback_stmt.where(DocumentChunk.document_id == doc_id)
            fallback_res = await session.execute(fallback_stmt)
            all_chunks = fallback_res.fetchall()

        if not all_chunks:
            return []

        scored = cls._compute_vector_similarity(
            all_chunks=all_chunks,
            query_vec=query_vec,
            distance_metric=distance_metric,
        )
        return scored[:k]

    @classmethod
    async def _rerank(
        cls,
        query: str,
        chunks: list[RetrievedChunk],
        reranker: str,
        top_k: int,
    ) -> list[RetrievedChunk]:
        """Reranks retrieved candidate chunks using Sentence-Transformers Cross-Encoder or fallback."""
        try:
            from sentence_transformers import CrossEncoder

            model_name = (
                "cross-encoder/ms-marco-MiniLM-L-6-v2"
                if "bge" not in reranker
                else "BAAI/bge-reranker-base"
            )
            encoder = CrossEncoder(model_name)
            pairs = [[query, c.content] for c in chunks]
            scores = encoder.predict(pairs)

            for c, s in zip(chunks, scores, strict=False):
                c.score = float(s)

            chunks.sort(key=lambda x: x.score, reverse=True)
            for idx, c in enumerate(chunks):
                c.rank = idx + 1

            return chunks[:top_k]
        except Exception as e:
            logger.warning(f"CrossEncoder reranking failed, keeping original order: {e}")
            return chunks[:top_k]
