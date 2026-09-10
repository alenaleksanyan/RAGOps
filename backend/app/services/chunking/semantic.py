from __future__ import annotations

import logging

from langchain_core.embeddings import Embeddings
from langchain_core.documents import Document as LCDocument

logger = logging.getLogger(__name__)


def split_semantic(
    documents: list[LCDocument],
    embeddings: Embeddings,
    breakpoint_threshold_type: str = "percentile",
    breakpoint_threshold_amount: float = 0.75,
) -> list[LCDocument]:
    """Splits documents into semantically cohesive chunks using embedding distance shifts."""
    try:
        from langchain_experimental.text_splitter import SemanticChunker

        chunker = SemanticChunker(
            embeddings=embeddings,
            breakpoint_threshold_type=breakpoint_threshold_type,
            breakpoint_threshold_amount=breakpoint_threshold_amount,
        )
        return chunker.split_documents(documents)
    except ImportError:
        logger.warning(
            "langchain_experimental not installed; falling back to sentence-boundary semantic splitter."
        )
        return _fallback_semantic_split(documents, embeddings, threshold=breakpoint_threshold_amount)


def _fallback_semantic_split(
    documents: list[LCDocument],
    embeddings: Embeddings,
    threshold: float = 0.75,
) -> list[LCDocument]:
    """Robust sentence-based semantic chunker with cosine distance thresholding."""
    import re
    import numpy as np

    result_docs: list[LCDocument] = []

    for doc in documents:
        # Split into sentences
        sentences = [s.strip() for s in re.split(r"(?<=[.?!])\s+", doc.page_content) if s.strip()]
        if not sentences:
            continue
        if len(sentences) == 1:
            result_docs.append(doc)
            continue

        # Embed all sentences
        try:
            embeds = embeddings.embed_documents(sentences)
            embed_matrix = np.array(embeds)
            # Normalize vectors
            norms = np.linalg.norm(embed_matrix, axis=1, keepdims=True)
            norms[norms == 0] = 1.0
            norm_embeds = embed_matrix / norms

            # Compute adjacent similarities
            sims = np.sum(norm_embeds[:-1] * norm_embeds[1:], axis=1)
            # Distances = 1 - cosine_similarity
            distances = 1 - sims

            # Compute threshold cutoff
            cutoff = np.percentile(distances, threshold * 100) if threshold <= 1.0 else threshold

            chunks: list[str] = []
            current_sentences: list[str] = [sentences[0]]

            for i, dist in enumerate(distances):
                if dist > cutoff:
                    chunks.append(" ".join(current_sentences))
                    current_sentences = [sentences[i + 1]]
                else:
                    current_sentences.append(sentences[i + 1])

            if current_sentences:
                chunks.append(" ".join(current_sentences))

            for idx, c in enumerate(chunks):
                meta = doc.metadata.copy()
                meta["semantic_chunk_idx"] = idx
                result_docs.append(LCDocument(page_content=c, metadata=meta))

        except Exception as e:
            logger.warning(f"Semantic embedding distance failed, fallback to paragraphs: {e}")
            from app.services.chunking.recursive import split_recursive
            result_docs.extend(split_recursive([doc], chunk_size=600, chunk_overlap=80))

    return result_docs
