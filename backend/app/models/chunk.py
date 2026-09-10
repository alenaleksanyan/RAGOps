from __future__ import annotations

import uuid
from typing import TYPE_CHECKING
from datetime import UTC, datetime

from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import DateTime, ForeignKey, Integer, String, Text

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.document import Document

try:
    # pyrefly: ignore [missing-import]
    from pgvector.sqlalchemy import Vector
    PGVECTOR_AVAILABLE = True
except ImportError:
    PGVECTOR_AVAILABLE = False
    Vector = None


class DocumentChunk(Base):
    __tablename__ = "document_chunks"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4, index=True)
    document_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True
    )
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    chunk_strategy: Mapped[str] = mapped_column(String(100), nullable=False)  # e.g. "recursive_500_50" | "semantic_0.75" | "parent_child" | "token_512_64"
    content: Mapped[str] = mapped_column(Text, nullable=False)
    token_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    embedding_model: Mapped[str | None] = mapped_column(String(100), nullable=True)
    embedding_provider: Mapped[str | None] = mapped_column(String(50), nullable=True)
    embedding_dim: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Vector embedding stored via pgvector — dynamic dimensionality (384, 768, 1024, 1536, 3072)
    embedding: Mapped[list[float] | None] = mapped_column(
        Vector() if PGVECTOR_AVAILABLE else Text, nullable=True
    )
    parent_chunk_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("document_chunks.id", ondelete="SET NULL"), nullable=True, index=True
    )
    chunk_metadata: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )

    document: Mapped["Document"] = relationship("Document", back_populates="chunks")
    parent_chunk: Mapped["DocumentChunk | None"] = relationship(
        "DocumentChunk", remote_side="DocumentChunk.id", foreign_keys=[parent_chunk_id]
    )

    def __repr__(self) -> str:
        return f"<DocumentChunk id={self.id} strategy={self.chunk_strategy} tokens={self.token_count}>"
