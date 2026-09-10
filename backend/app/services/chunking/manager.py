from __future__ import annotations

import logging
from typing import Any
from dataclasses import dataclass

# pyrefly: ignore [missing-import]
from langchain_core.documents import Document as LCDocument

from app.services.chunking.semantic import split_semantic
from app.services.chunking.recursive import split_recursive
from app.services.providers.factory import ModelProviderFactory
from app.services.chunking.token_window import split_token_window
from app.services.chunking.parent_document import split_parent_document

logger = logging.getLogger(__name__)


@dataclass
class ChunkResult:
    content: str
    chunk_index: int
    strategy_name: str
    token_count: int
    metadata: dict[str, Any]
    parent_id: str | None = None
    is_parent: bool = False


class ChunkingManager:
    """Orchestrates chunking execution across Recursive, Semantic, Parent-Document, and

    Token-Window strategies with metadata tagging and token calculations.
    """

    @classmethod
    def estimate_token_count(cls, text: str) -> int:
        try:
            # pyrefly: ignore [missing-import]
            import tiktoken
            enc = tiktoken.get_encoding("cl100k_base")
            return len(enc.encode(text))
        except Exception:
            # Approximate 4 characters per token
            return max(1, len(text) // 4)

    @classmethod
    async def execute_strategy(
        cls,
        documents: list[LCDocument],
        strategy_config: dict[str, Any],
        api_keys: dict[str, str] | None = None,
    ) -> list[ChunkResult]:
        """Execute a chunking strategy definition and return normalized ChunkResults."""
        stype = strategy_config.get("type", "recursive").lower()
        strategy_key = f"{stype}"
        results: list[ChunkResult] = []

        if stype == "recursive":
            size = strategy_config.get("chunk_size", 500)
            overlap = strategy_config.get("chunk_overlap", 50)
            strategy_key = f"recursive_{size}_{overlap}"
            docs = split_recursive(documents, chunk_size=size, chunk_overlap=overlap)

            for idx, d in enumerate(docs):
                tokens = cls.estimate_token_count(d.page_content)
                meta = {**d.metadata, "chunk_strategy": strategy_key, "chunk_index": idx}
                results.append(
                    ChunkResult(
                        content=d.page_content,
                        chunk_index=idx,
                        strategy_name=strategy_key,
                        token_count=tokens,
                        metadata=meta,
                    )
                )

        elif stype == "semantic":
            threshold = strategy_config.get("threshold", 0.75)
            thresh_type = strategy_config.get("threshold_type", "percentile")
            strategy_key = f"semantic_{thresh_type}_{threshold}"

            # Get embedding instance for semantic distance computation
            emb_prov = strategy_config.get("embedding_provider", "openai")
            emb_model = strategy_config.get("embedding_model", "text-embedding-3-small")
            emb_key = (api_keys or {}).get("embedding_api_key")

            embeddings = ModelProviderFactory.get_embeddings(
                provider=emb_prov, model_name=emb_model, api_key=emb_key
            )
            docs = split_semantic(
                documents,
                embeddings=embeddings,
                breakpoint_threshold_type=thresh_type,
                breakpoint_threshold_amount=threshold,
            )

            for idx, d in enumerate(docs):
                tokens = cls.estimate_token_count(d.page_content)
                meta = {**d.metadata, "chunk_strategy": strategy_key, "chunk_index": idx}
                results.append(
                    ChunkResult(
                        content=d.page_content,
                        chunk_index=idx,
                        strategy_name=strategy_key,
                        token_count=tokens,
                        metadata=meta,
                    )
                )

        elif stype in ("parent_document", "parent_child", "hierarchical"):
            p_size = strategy_config.get("parent_chunk_size", 1500)
            p_overlap = strategy_config.get("parent_chunk_overlap", 150)
            c_size = strategy_config.get("child_chunk_size", 300)
            c_overlap = strategy_config.get("child_chunk_overlap", 30)
            strategy_key = f"parent_{p_size}_{c_size}"

            parents, children = split_parent_document(
                documents,
                parent_chunk_size=p_size,
                parent_chunk_overlap=p_overlap,
                child_chunk_size=c_size,
                child_chunk_overlap=c_overlap,
            )

            # Store parents first
            for p_idx, p in enumerate(parents):
                p_id = p.metadata.get("parent_id")
                tokens = cls.estimate_token_count(p.page_content)
                meta = {**p.metadata, "chunk_strategy": strategy_key, "chunk_index": p_idx}
                results.append(
                    ChunkResult(
                        content=p.page_content,
                        chunk_index=p_idx,
                        strategy_name=strategy_key,
                        token_count=tokens,
                        metadata=meta,
                        parent_id=p_id,
                        is_parent=True,
                    )
                )

            # Store child vectors with parent reference
            for c_idx, c in enumerate(children):
                p_id = c.metadata.get("parent_id")
                tokens = cls.estimate_token_count(c.page_content)
                meta = {**c.metadata, "chunk_strategy": strategy_key, "chunk_index": len(parents) + c_idx}
                results.append(
                    ChunkResult(
                        content=c.page_content,
                        chunk_index=len(parents) + c_idx,
                        strategy_name=strategy_key,
                        token_count=tokens,
                        metadata=meta,
                        parent_id=p_id,
                        is_parent=False,
                    )
                )

        elif stype in ("token_window", "token"):
            size = strategy_config.get("chunk_size", 512)
            overlap = strategy_config.get("chunk_overlap", 64)
            strategy_key = f"token_{size}_{overlap}"
            docs = split_token_window(documents, chunk_size=size, chunk_overlap=overlap)

            for idx, d in enumerate(docs):
                tokens = cls.estimate_token_count(d.page_content)
                meta = {**d.metadata, "chunk_strategy": strategy_key, "chunk_index": idx}
                results.append(
                    ChunkResult(
                        content=d.page_content,
                        chunk_index=idx,
                        strategy_name=strategy_key,
                        token_count=tokens,
                        metadata=meta,
                    )
                )

        return results
