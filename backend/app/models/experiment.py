from __future__ import annotations

import enum
from typing import TYPE_CHECKING
import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, Enum, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.evaluation import EvaluationResult


class RunStatus(str, enum.Enum):
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


class ExperimentRun(Base):
    __tablename__ = "experiment_runs"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4, index=True)
    dataset_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("test_datasets.id", ondelete="SET NULL"), nullable=True, index=True
    )
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[RunStatus] = mapped_column(
        Enum(RunStatus, name="run_status"), default=RunStatus.PENDING, nullable=False, index=True
    )
    pipeline_config: Mapped[dict] = mapped_column(JSONB, nullable=False)
    # Full configuration snapshot:
    # {
    #   "chunking_strategy": {...},
    #   "embedding_provider": "openai",
    #   "embedding_model": "text-embedding-3-small",
    #   "retrieval_k": 5,
    #   "distance_metric": "cosine",
    #   "reranker": null,
    #   "llm_provider": "openai",
    #   "llm_model": "gpt-4o-mini",
    #   "user_api_keys": {}  # per-run key overrides (encrypted)
    # }
    arq_job_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    error_message: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    total_test_cases: Mapped[int | None] = mapped_column(nullable=True)
    completed_cases: Mapped[int | None] = mapped_column(default=0, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )

    evaluation_results: Mapped[list["EvaluationResult"]] = relationship(  # noqa: F821
        "EvaluationResult", back_populates="experiment_run", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<ExperimentRun id={self.id} status={self.status}>"
