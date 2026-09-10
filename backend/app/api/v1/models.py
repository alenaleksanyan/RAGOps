from __future__ import annotations

import json
from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import StreamingResponse

from app.schemas.model import ModelInfo, ModelPullProgress, ModelPullRequest
from app.services.models.model_service import ModelService

router = APIRouter(prefix="/models", tags=["Model Registry & Management"])


@router.get("", response_model=list[ModelInfo])
async def list_models(
    type: str | None = Query(default=None, description="Filter by 'llm' or 'embedding'"),
    provider: str | None = Query(default=None, description="Filter by provider ('ollama', 'fastembed')"),
):
    """List all available and downloaded models with status, disk size, and hardware RAM requirements."""
    models = await ModelService.list_all_models()
    if type:
        models = [m for m in models if m.type == type]
    if provider:
        models = [m for m in models if m.provider == provider]
    return models


@router.post("/pull")
async def pull_model(req: ModelPullRequest):
    """Pull/download a model with real-time SSE progress streaming."""
    async def event_generator():
        async for progress in ModelService.pull_model_stream(req.model_name, req.provider):
            yield f"data: {json.dumps(progress.dict())}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.delete("/{model_name:path}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_model(model_name: str):
    """Delete a downloaded local model from Ollama."""
    success = await ModelService.delete_ollama_model(model_name)
    if not success:
        raise HTTPException(status_code=400, detail=f"Failed to delete model {model_name}")
    return None
