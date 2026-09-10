from __future__ import annotations

import json
import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
    status,
)

from app.core.database import get_db
from app.models.document import Document
from app.models.chunk import DocumentChunk
from app.services.chunking.manager import ChunkingManager
from app.services.ingestion.parser import DocumentParserEngine
from app.services.retrieval.vector_store import VectorRetrievalEngine
from app.schemas.document import DocumentChunkResponse, DocumentResponse

router = APIRouter(prefix="/documents", tags=["Document Management"])


@router.post("/upload", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
async def upload_document(
    file: UploadFile = File(...),
    chunk_strategies_json: str = Form(
        default='[{"type": "recursive", "chunk_size": 500, "chunk_overlap": 50}]'
    ),
    embedding_provider: str = Form(default="fastembed"),
    embedding_model: str = Form(default="BAAI/bge-small-en-v1.5"),
    api_keys_json: str | None = Form(default=None),
    db: AsyncSession = Depends(get_db),
):
    """Upload a document (PDF, Markdown, DOCX, TXT), parse layout structure, compute chunks,
    and store vector embeddings.
    """
    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    content_hash = DocumentParserEngine.compute_sha256(file_bytes)

    # Check for duplicate
    stmt = select(Document).where(Document.content_hash == content_hash)
    existing = (await db.execute(stmt)).scalar_one_or_none()
    if existing:
        return existing

    # 1. Parse document structure
    parsed = await DocumentParserEngine.parse_bytes(
        file_bytes, filename=file.filename or "uploaded_file.txt", mime_type=file.content_type or "text/plain"
    )

    doc_id = uuid.uuid4()
    doc = Document(
        id=doc_id,
        filename=file.filename or "document.txt",
        original_filename=file.filename or "document.txt",
        file_size=len(file_bytes),
        mime_type=file.content_type or "text/plain",
        content_hash=content_hash,
        status="processing",
        page_count=parsed.page_count,
        doc_metadata=parsed.doc_metadata,
    )
    db.add(doc)
    await db.flush()

    # 2. Parse chunking strategies
    try:
        strategies = json.loads(chunk_strategies_json)
    except json.JSONDecodeError:
        strategies = [{"type": "recursive", "chunk_size": 500, "chunk_overlap": 50}]

    api_keys = json.loads(api_keys_json) if api_keys_json else {}

    # 3. Execute chunking & embedding
    total_chunks = 0
    for strat in strategies:
        chunk_results = await ChunkingManager.execute_strategy(
            parsed.documents, strat, api_keys=api_keys
        )

        is_parent_strategy = strat.get("type") == "parent_document"

        if is_parent_strategy:
            # 1. Build UUID mapping for parent blocks
            parent_uuid_map: dict[str, uuid.UUID] = {}
            for c in chunk_results:
                if c.is_parent and c.parent_id:
                    try:
                        parent_uuid_map[c.parent_id] = uuid.UUID(c.parent_id)
                    except ValueError:
                        parent_uuid_map[c.parent_id] = uuid.uuid4()

            # 2. Link child chunks to their parent UUID
            raw_chunks = [
                {
                    "id": parent_uuid_map.get(c.parent_id, uuid.uuid4()) if c.is_parent else uuid.uuid4(),
                    "content": c.content,
                    "chunk_index": c.chunk_index,
                    "strategy_name": c.strategy_name,
                    "token_count": c.token_count,
                    "metadata": c.metadata,
                    "parent_chunk_id": parent_uuid_map.get(c.parent_id) if not c.is_parent else None,
                    "is_parent": c.is_parent,
                }
                for c in chunk_results
            ]
        else:
            # Standard Flat Chunking: clean 1-pass mapping
            raw_chunks = [
                {
                    "id": uuid.uuid4(),
                    "content": c.content,
                    "chunk_index": c.chunk_index,
                    "strategy_name": c.strategy_name,
                    "token_count": c.token_count,
                    "metadata": c.metadata,
                    "parent_chunk_id": None,
                    "is_parent": False,
                }
                for c in chunk_results
            ]

        stored_count = await VectorRetrievalEngine.embed_and_store_chunks(
            session=db,
            document_id=doc_id,
            chunks=raw_chunks,
            embedding_provider=embedding_provider,
            embedding_model=embedding_model,
            api_key=api_keys.get("embedding_api_key"),
        )
        total_chunks += stored_count

    doc.status = "ready"
    await db.commit()
    await db.refresh(doc)

    res = DocumentResponse.from_orm(doc)
    res.chunk_count = total_chunks

    return res


@router.get("", response_model=list[DocumentResponse])
async def list_documents(
    db: AsyncSession = Depends(get_db),
):
    """List all ingested documents."""
    stmt = (
        select(Document, func.count(DocumentChunk.id).label("chunk_count"))
        .outerjoin(DocumentChunk, Document.id == DocumentChunk.document_id)
        .group_by(Document.id)
        .order_by(Document.created_at.desc())
    )
    res = await db.execute(stmt)
    rows = res.all()

    results: list[DocumentResponse] = []
    for doc, c_count in rows:
        d_resp = DocumentResponse.from_orm(doc)
        d_resp.chunk_count = c_count
        results.append(d_resp)

    return results


@router.get("/{document_id}", response_model=DocumentResponse)
async def get_document(
    document_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Get document metadata by ID."""
    stmt = select(Document).where(Document.id == document_id)
    doc = (await db.execute(stmt)).scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc


@router.get("/{document_id}/chunks", response_model=list[DocumentChunkResponse])
async def list_document_chunks(
    document_id: uuid.UUID,
    strategy: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """Inspect chunks generated for a document, with optional strategy filtering."""
    doc_stmt = select(Document).where(Document.id == document_id)
    doc = (await db.execute(doc_stmt)).scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    stmt = select(DocumentChunk).where(DocumentChunk.document_id == document_id)
    if strategy:
        stmt = stmt.where(DocumentChunk.chunk_strategy.ilike(f"%{strategy}%"))
    stmt = stmt.order_by(DocumentChunk.chunk_index.asc()).offset(offset).limit(limit)

    res = await db.execute(stmt)
    return res.scalars().all()


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    document_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Delete a document and cascade delete all its chunks and vector embeddings."""
    stmt = select(Document).where(Document.id == document_id)
    doc = (await db.execute(stmt)).scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    await db.delete(doc)
    await db.commit()
    return None
