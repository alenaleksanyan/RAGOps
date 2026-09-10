from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel


class DocumentChunkResponse(BaseModel):
    id: uuid.UUID
    chunk_index: int
    chunk_strategy: str
    content: str
    token_count: int | None
    embedding_model: str | None
    embedding_provider: str | None
    parent_chunk_id: uuid.UUID | None
    chunk_metadata: dict[str, Any] | None
    created_at: datetime

    class Config:
        from_attributes = True


class DocumentResponse(BaseModel):
    id: uuid.UUID
    filename: str
    original_filename: str
    file_size: int
    mime_type: str
    content_hash: str
    status: str
    page_count: int | None
    doc_metadata: dict[str, Any] | None
    chunk_count: int | None = None
    created_at: datetime

    class Config:
        from_attributes = True
