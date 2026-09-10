from __future__ import annotations

from fastapi import APIRouter, Depends, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.schemas.chat import ChatRequest, ChatResponse
from app.services.evaluation.rag_agent import ConversationalRAGAgent

router = APIRouter(prefix="/chat", tags=["RAG Interactive Playground & Chat"])


@router.post("/message", response_model=ChatResponse, status_code=status.HTTP_200_OK)
async def send_chat_message(
    req: ChatRequest,
    db: AsyncSession = Depends(get_db),
):
    """Interactive RAG chat endpoint: non-streaming fallback."""
    raw_messages = [{"role": m.role, "content": m.content} for m in req.messages]
    result = await ConversationalRAGAgent.process_chat(
        session=db,
        messages=raw_messages,
        config=req.rag_config,
    )
    return result


@router.post("/stream")
async def stream_chat_message(
    req: ChatRequest,
    db: AsyncSession = Depends(get_db),
):
    """Server-Sent Events (SSE) streaming endpoint for real-time token streaming and live telemetry."""
    raw_messages = [{"role": m.role, "content": m.content} for m in req.messages]

    return StreamingResponse(
        ConversationalRAGAgent.stream_chat(
            session=db,
            messages=raw_messages,
            config=req.rag_config,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
