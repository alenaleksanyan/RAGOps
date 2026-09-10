from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class TestCaseCreate(BaseModel):
    question: str
    ground_truth_answer: str
    expected_context: str | None = None
    question_type: str = "single_hop"  # single_hop | multi_hop | adversarial
    source_chunk_ids: list[str] | None = None


class TestCaseUpdate(BaseModel):
    question: str | None = None
    ground_truth_answer: str | None = None
    expected_context: str | None = None
    is_verified: bool | None = None


class TestCaseResponse(BaseModel):
    id: uuid.UUID
    dataset_id: uuid.UUID
    question: str
    ground_truth_answer: str
    expected_context: str | None
    question_type: str
    is_verified: bool
    created_at: datetime

    class Config:
        from_attributes = True


class TestDatasetCreate(BaseModel):
    name: str
    description: str | None = None
    document_id: uuid.UUID | None = None


class GenerateDatasetRequest(BaseModel):
    document_id: uuid.UUID
    name: str | None = None
    num_questions: int = Field(default=10, ge=1, le=50)
    provider: str = "ollama"
    model_name: str = "llama3.2"
    api_key: str | None = None


class TestDatasetResponse(BaseModel):
    id: uuid.UUID
    document_id: uuid.UUID | None
    name: str
    description: str | None
    test_cases_count: int = 0
    created_at: datetime

    class Config:
        from_attributes = True
