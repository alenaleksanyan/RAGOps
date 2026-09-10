from __future__ import annotations

from typing import Literal
from pydantic import BaseModel, Field


class ModelInfo(BaseModel):
    id: str
    name: str
    provider: Literal["ollama", "fastembed", "openai", "anthropic", "cohere", "google"]
    type: Literal["llm", "embedding", "reranker"]
    is_downloaded: bool
    size_bytes: int | None = None
    size_formatted: str | None = None
    ram_required: str | None = None
    description: str | None = None
    modified_at: str | None = None
    parameter_size: str | None = None
    quantization: str | None = None


class ModelPullRequest(BaseModel):
    model_name: str
    provider: Literal["ollama", "fastembed"] = "ollama"


class ModelPullProgress(BaseModel):
    model_name: str
    status: str
    digest: str | None = None
    total: int | None = None
    completed: int | None = None
    percentage: int | None = None
    speed_formatted: str | None = None
    error: str | None = None
