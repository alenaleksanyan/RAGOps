from __future__ import annotations

import uuid
from typing import Any

from pydantic import BaseModel, Field


class ChatMessage(BaseModel):
    role: str  # "user" | "assistant" | "system"
    content: str
    citations: list[dict[str, Any]] | None = None
    metrics: dict[str, Any] | None = None
    retrieved_chunks: list[dict[str, Any]] | None = None


class RAGConfigPayload(BaseModel):
    rag_mode: str = "direct"  # "direct" | "agentic" | "hybrid"
    document_ids: list[str] | None = None
    chunk_strategy: str | None = None  # recursive | semantic | parent_document | token_window
    embedding_provider: str = "fastembed"
    embedding_model: str = "BAAI/bge-small-en-v1.5"
    retrieval_k: int = Field(default=4, ge=1, le=20)
    similarity_threshold: float = Field(default=0.0, ge=0.0, le=1.0)
    distance_metric: str = "cosine"  # cosine | l2 | ip
    reranker: str | None = None  # None | "bge-reranker-large" | "cross-encoder/ms-marco"
    llm_provider: str = "ollama"
    llm_model: str = "llama3.2"
    temperature: float = Field(default=0.1, ge=0.0, le=1.0)
    system_prompt: str | None = None
    enable_live_metrics: bool = True
    user_api_keys: dict[str, str] = Field(default_factory=dict)


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    rag_config: RAGConfigPayload


class AtomicClaim(BaseModel):
    claim: str
    status: str  # "supported" | "unsupported" | "partially_supported"
    citation_id: int | None = None
    source_snippet: str | None = None


class LatencyBreakdown(BaseModel):
    embedding_ms: float = 0.0
    vector_search_ms: float = 0.0
    reranking_ms: float = 0.0
    ttft_ms: float = 0.0
    generation_ms: float = 0.0
    total_ms: float = 0.0


class AgentToolCall(BaseModel):
    step: int
    tool_name: str = "retrieve_documents"
    query: str
    rationale: str | None = None
    latency_ms: float = 0.0
    chunks_found: int = 0
    chunks: list[dict[str, Any]] = Field(default_factory=list)


class LiveTelemetryMetrics(BaseModel):
    ttft_ms: float
    retrieval_latency_ms: float
    generation_latency_ms: float
    total_latency_ms: float
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    estimated_cost_usd: float
    rag_mode: str = "direct"
    rewritten_query: str | None = None
    routing_decision: str | None = None
    faithfulness: float | None = None
    context_precision: float | None = None
    answer_relevance: float | None = None
    context_utilization_rate: float | None = None  # 0.0 to 1.0 (% context used)
    context_noise_ratio: float | None = None  # 0.0 to 1.0 (% irrelevant chunks)
    answer_completeness: float | None = None  # 0.0 to 1.0
    claims: list[AtomicClaim] = Field(default_factory=list)
    tool_calls: list[AgentToolCall] = Field(default_factory=list)
    latency_breakdown: LatencyBreakdown | None = None


class ChatResponse(BaseModel):
    role: str = "assistant"
    content: str
    citations: list[dict[str, Any]]
    retrieved_chunks: list[dict[str, Any]]
    telemetry: LiveTelemetryMetrics
