from __future__ import annotations

import uuid
from typing import Any

from pydantic import BaseModel

from app.schemas.experiment import ExperimentRunResponse


class MetricAverages(BaseModel):
    context_precision: float
    context_recall: float
    faithfulness: float
    answer_relevance: float
    avg_latency_ms: float
    avg_ttft_ms: float
    total_cost_usd: float
    total_tokens: int


class TestCaseComparison(BaseModel):
    test_case_id: uuid.UUID
    question: str
    ground_truth_answer: str
    run_a_answer: str | None
    run_b_answer: str | None
    run_a_precision: float | None
    run_b_precision: float | None
    run_a_recall: float | None
    run_b_recall: float | None
    run_a_faithfulness: float | None
    run_b_faithfulness: float | None
    run_a_relevance: float | None
    run_b_relevance: float | None
    run_a_latency_ms: float | None
    run_b_latency_ms: float | None
    run_a_chunks: list[dict[str, Any]] | None
    run_b_chunks: list[dict[str, Any]] | None


class RunComparisonResponse(BaseModel):
    run_a: ExperimentRunResponse
    run_b: ExperimentRunResponse
    metrics_a: MetricAverages
    metrics_b: MetricAverages
    diffs: dict[str, float]  # delta between metric averages
    test_case_comparisons: list[TestCaseComparison]


class TradeOffPoint(BaseModel):
    run_id: uuid.UUID
    run_name: str
    config_label: str
    context_precision: float
    context_recall: float
    faithfulness: float
    answer_relevance: float
    latency_ms: float
    cost_usd: float


class FailureAnalysisItem(BaseModel):
    result_id: uuid.UUID
    run_id: uuid.UUID
    test_case_id: uuid.UUID
    question: str
    ground_truth_answer: str
    generated_answer: str | None
    failure_type: str  # "hallucination" | "low_recall" | "low_precision" | "high_latency"
    score: float
    retrieved_chunks: list[dict[str, Any]] | None
