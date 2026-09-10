from __future__ import annotations

from typing import TYPE_CHECKING
import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.evaluation import EvaluationResult


class TestDataset(Base):
    __tablename__ = "test_datasets"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4, index=True)
    document_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("documents.id", ondelete="SET NULL"), nullable=True, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    generation_config: Mapped[dict | None] = mapped_column(JSONB, nullable=True)  # LLM, num_questions, strategies used
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )

    test_cases: Mapped[list["TestCase"]] = relationship(
        "TestCase", back_populates="dataset", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<TestDataset id={self.id} name={self.name}>"


class TestCase(Base):
    __tablename__ = "test_cases"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4, index=True)
    dataset_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("test_datasets.id", ondelete="CASCADE"), nullable=False, index=True
    )
    question: Mapped[str] = mapped_column(Text, nullable=False)
    ground_truth_answer: Mapped[str] = mapped_column(Text, nullable=False)
    expected_context: Mapped[str | None] = mapped_column(Text, nullable=True)
    question_type: Mapped[str] = mapped_column(String(50), default="single_hop", nullable=False)
    # single_hop | multi_hop | adversarial
    source_chunk_ids: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    is_verified: Mapped[bool] = mapped_column(default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )

    dataset: Mapped["TestDataset"] = relationship("TestDataset", back_populates="test_cases")
    evaluation_results: Mapped[list[EvaluationResult]] = relationship(
        "EvaluationResult", back_populates="test_case"
    )

    def __repr__(self) -> str:
        return f"<TestCase id={self.id} type={self.question_type}>"
