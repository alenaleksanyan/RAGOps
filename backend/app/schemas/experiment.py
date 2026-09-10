from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from app.models.experiment import RunStatus


class ChunkingStrategyConfig(BaseModel):
    type: str = "recursive"  # recursive | semantic | parent_document | token_window
    chunk_size: int = 500
    chunk_overlap: int = 50
    threshold: float | None = 0.75
    parent_chunk_size: int | None = 1500
    child_chunk_size: int | None = 300


class MatrixConfig(BaseModel):
    chunking_strategies: list[dict[str, Any]] = Field(
        default_factory=lambda: [{"type": "recursive", "chunk_size": 500, "chunk_overlap": 50}]
    )
    embedding_models: list[str] = Field(default_factory=lambda: ["text-embedding-3-small"])
    embedding_providers: list[str] = Field(default_factory=lambda: ["openai"])
    retrieval_k: list[int] = Field(default_factory=lambda: [3, 5])
    distance_metrics: list[str] = Field(default_factory=lambda: ["cosine"])
    rerankers: list[str | None] = Field(default_factory=lambda: [None])
    llm_models: list[str] = Field(default_factory=lambda: ["gpt-4o-mini"])
    llm_providers: list[str] = Field(default_factory=lambda: ["openai"])
    user_api_keys: dict[str, str] = Field(default_factory=dict)


class ExperimentRunCreate(BaseModel):
    dataset_id: uuid.UUID
    matrix: MatrixConfig
    name: str | None = None


class SingleRunTriggerRequest(BaseModel):
    dataset_id: uuid.UUID
    pipeline_config: dict[str, Any]
    name: str | None = None


class EvaluationResultResponse(BaseModel):
    id: uuid.UUID
    test_case_id: uuid.UUID
    question: str | None = None
    ground_truth_answer: str | None = None
    question_type: str | None = None
    generated_answer: str | None
    retrieved_chunks_json: list[dict[str, Any]] | None
    context_precision: float | None
    context_recall: float | None
    faithfulness: float | None
    answer_relevance: float | None
    latency_ms: float | None
    ttft_ms: float | None
    retrieval_latency_ms: float | None
    total_tokens: int | None
    estimated_cost_usd: float | None
    error_message: str | None
    created_at: datetime

    class Config:
        from_attributes = True


class ExperimentRunResponse(BaseModel):
    id: uuid.UUID
    dataset_id: uuid.UUID | None
    name: str | None
    status: RunStatus
    pipeline_config: dict[str, Any]
    total_test_cases: int | None
    completed_cases: int | None
    started_at: datetime | None
    completed_at: datetime | None
    created_at: datetime
    avg_context_precision: float | None = None
    avg_context_recall: float | None = None
    avg_faithfulness: float | None = None
    avg_answer_relevance: float | None = None
    avg_latency_ms: float | None = None
    total_cost_usd: float | None = None

    class Config:
        from_attributes = True


class ExperimentStatusResponse(BaseModel):
    id: uuid.UUID
    status: RunStatus
    total: int | None
    completed: int | None
    progress_percentage: int
    started_at: datetime | None
    completed_at: datetime | None
