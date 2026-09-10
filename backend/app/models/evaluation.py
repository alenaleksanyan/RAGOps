from __future__ import annotations

from typing import TYPE_CHECKING
import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.dataset import TestCase
    from app.models.experiment import ExperimentRun


class EvaluationResult(Base):
    __tablename__ = "evaluation_results"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4, index=True)
    experiment_run_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("experiment_runs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    test_case_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("test_cases.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # --- Generated outputs ---
    generated_answer: Mapped[str | None] = mapped_column(Text, nullable=True)
    retrieved_chunks_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    # [{chunk_id, content, score, rank}, ...]

    # --- Multi-Metric Scores ---
    context_precision: Mapped[float | None] = mapped_column(Float, nullable=True)
    context_recall: Mapped[float | None] = mapped_column(Float, nullable=True)
    faithfulness: Mapped[float | None] = mapped_column(Float, nullable=True)
    answer_relevance: Mapped[float | None] = mapped_column(Float, nullable=True)

    # --- Performance Telemetry ---
    latency_ms: Mapped[float | None] = mapped_column(Float, nullable=True)      # total end-to-end latency
    ttft_ms: Mapped[float | None] = mapped_column(Float, nullable=True)         # time-to-first-token
    retrieval_latency_ms: Mapped[float | None] = mapped_column(Float, nullable=True)
    total_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    prompt_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    completion_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    estimated_cost_usd: Mapped[float | None] = mapped_column(Float, nullable=True)

    # --- Error info ---
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )

    experiment_run: Mapped["ExperimentRun"] = relationship("ExperimentRun", back_populates="evaluation_results")  # noqa: F821
    test_case: Mapped["TestCase"] = relationship("TestCase", back_populates="evaluation_results")  # noqa: F821

    def __repr__(self) -> str:
        return f"<EvaluationResult id={self.id} precision={self.context_precision:.3f}>"
