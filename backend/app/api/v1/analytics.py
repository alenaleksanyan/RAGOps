from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.database import get_db
from app.models.dataset import TestCase
from app.models.experiment import ExperimentRun
from app.models.evaluation import EvaluationResult
from app.schemas.analytics import (
    MetricAverages,
    TradeOffPoint,
    TestCaseComparison,
    FailureAnalysisItem,
    RunComparisonResponse,
)
from app.schemas.experiment import ExperimentRunResponse

router = APIRouter(prefix="/analytics", tags=["Comparative Analytics & Failure Analysis"])


def _compute_metrics(results: list[EvaluationResult]) -> MetricAverages:
    if not results:
        return MetricAverages(
            context_precision=0.0,
            context_recall=0.0,
            faithfulness=0.0,
            answer_relevance=0.0,
            avg_latency_ms=0.0,
            avg_ttft_ms=0.0,
            total_cost_usd=0.0,
            total_tokens=0,
        )

    precisions = [r.context_precision for r in results if r.context_precision is not None]
    recalls = [r.context_recall for r in results if r.context_recall is not None]
    faiths = [r.faithfulness for r in results if r.faithfulness is not None]
    relevances = [r.answer_relevance for r in results if r.answer_relevance is not None]
    latencies = [r.latency_ms for r in results if r.latency_ms is not None]
    ttfts = [r.ttft_ms for r in results if r.ttft_ms is not None]
    costs = [r.estimated_cost_usd for r in results if r.estimated_cost_usd is not None]
    tokens = [r.total_tokens for r in results if r.total_tokens is not None]

    return MetricAverages(
        context_precision=sum(precisions) / len(precisions) if precisions else 0.0,
        context_recall=sum(recalls) / len(recalls) if recalls else 0.0,
        faithfulness=sum(faiths) / len(faiths) if faiths else 0.0,
        answer_relevance=sum(relevances) / len(relevances) if relevances else 0.0,
        avg_latency_ms=sum(latencies) / len(latencies) if latencies else 0.0,
        avg_ttft_ms=sum(ttfts) / len(ttfts) if ttfts else 0.0,
        total_cost_usd=sum(costs) if costs else 0.0,
        total_tokens=sum(tokens) if tokens else 0,
    )


@router.get("/compare", response_model=RunComparisonResponse)
async def compare_runs(
    run_a: uuid.UUID = Query(..., description="First experiment run ID"),
    run_b: uuid.UUID = Query(..., description="Second experiment run ID"),
    db: AsyncSession = Depends(get_db),
):
    """Compare two experiment runs side-by-side with overall metric diffs and per-test-case answer inspections."""
    stmt_a = select(ExperimentRun).where(ExperimentRun.id == run_a)
    stmt_b = select(ExperimentRun).where(ExperimentRun.id == run_b)

    res_a = (await db.execute(stmt_a)).scalar_one_or_none()
    res_b = (await db.execute(stmt_b)).scalar_one_or_none()

    if not res_a or not res_b:
        raise HTTPException(status_code=404, detail="One or both experiment runs were not found")

    # Fetch evaluation results for both runs
    evals_a = (await db.execute(select(EvaluationResult).where(EvaluationResult.experiment_run_id == run_a))).scalars().all()
    evals_b = (await db.execute(select(EvaluationResult).where(EvaluationResult.experiment_run_id == run_b))).scalars().all()

    metrics_a = _compute_metrics(evals_a)
    metrics_b = _compute_metrics(evals_b)

    diffs = {
        "context_precision": metrics_b.context_precision - metrics_a.context_precision,
        "context_recall": metrics_b.context_recall - metrics_a.context_recall,
        "faithfulness": metrics_b.faithfulness - metrics_a.faithfulness,
        "answer_relevance": metrics_b.answer_relevance - metrics_a.answer_relevance,
        "latency_ms": metrics_b.avg_latency_ms - metrics_a.avg_latency_ms,
        "cost_usd": metrics_b.total_cost_usd - metrics_a.total_cost_usd,
    }

    # Map by test case ID
    map_a = {e.test_case_id: e for e in evals_a}
    map_b = {e.test_case_id: e for e in evals_b}

    all_tc_ids = set(map_a.keys()).union(set(map_b.keys()))
    tc_stmt = select(TestCase).where(TestCase.id.in_(all_tc_ids))
    test_cases = {tc.id: tc for tc in (await db.execute(tc_stmt)).scalars().all()}

    tc_comparisons: list[TestCaseComparison] = []
    for tc_id in all_tc_ids:
        tc = test_cases.get(tc_id)
        if not tc:
            continue
        ea = map_a.get(tc_id)
        eb = map_b.get(tc_id)

        tc_comparisons.append(
            TestCaseComparison(
                test_case_id=tc_id,
                question=tc.question,
                ground_truth_answer=tc.ground_truth_answer,
                run_a_answer=ea.generated_answer if ea else None,
                run_b_answer=eb.generated_answer if eb else None,
                run_a_precision=ea.context_precision if ea else None,
                run_b_precision=eb.context_precision if eb else None,
                run_a_recall=ea.context_recall if ea else None,
                run_b_recall=eb.context_recall if eb else None,
                run_a_faithfulness=ea.faithfulness if ea else None,
                run_b_faithfulness=eb.faithfulness if eb else None,
                run_a_relevance=ea.answer_relevance if ea else None,
                run_b_relevance=eb.answer_relevance if eb else None,
                run_a_latency_ms=ea.latency_ms if ea else None,
                run_b_latency_ms=eb.latency_ms if eb else None,
                run_a_chunks=ea.retrieved_chunks_json if ea else None,
                run_b_chunks=eb.retrieved_chunks_json if eb else None,
            )
        )

    return RunComparisonResponse(
        run_a=ExperimentRunResponse.from_orm(res_a),
        run_b=ExperimentRunResponse.from_orm(res_b),
        metrics_a=metrics_a,
        metrics_b=metrics_b,
        diffs=diffs,
        test_case_comparisons=tc_comparisons,
    )


@router.get("/tradeoffs", response_model=list[TradeOffPoint])
async def get_tradeoff_points(
    db: AsyncSession = Depends(get_db),
):
    """Retrieve scatter chart plot coordinates (Cost vs. Accuracy, Latency vs. Recall) across all runs."""
    stmt = select(ExperimentRun).where(
        ExperimentRun.status == "COMPLETED",
    ).order_by(ExperimentRun.created_at.desc()).limit(20)

    runs = (await db.execute(stmt)).scalars().all()
    points: list[TradeOffPoint] = []

    for r in runs:
        eval_stmt = select(EvaluationResult).where(EvaluationResult.experiment_run_id == r.id)
        evals = (await db.execute(eval_stmt)).scalars().all()
        m = _compute_metrics(evals)

        cfg = r.pipeline_config or {}
        label = f"{cfg.get('chunk_strategy', 'rec')} | {cfg.get('embedding_model', 'emb')} | k={cfg.get('retrieval_k', 5)}"

        points.append(
            TradeOffPoint(
                run_id=r.id,
                run_name=r.name or str(r.id)[:8],
                config_label=label,
                context_precision=round(m.context_precision, 3),
                context_recall=round(m.context_recall, 3),
                faithfulness=round(m.faithfulness, 3),
                answer_relevance=round(m.answer_relevance, 3),
                latency_ms=round(m.avg_latency_ms, 1),
                cost_usd=round(m.total_cost_usd, 6),
            )
        )

    return points


@router.get("/failures", response_model=list[FailureAnalysisItem])
async def get_failures(
    run_id: uuid.UUID = Query(..., description="Experiment run ID to analyze for failure cases"),
    db: AsyncSession = Depends(get_db),
):
    """Deep failure analysis identifying hallucinated answers, missing contexts, and high-latency queries."""
    stmt = select(ExperimentRun).where(ExperimentRun.id == run_id)
    run = (await db.execute(stmt)).scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Experiment run not found")

    eval_stmt = select(EvaluationResult).where(EvaluationResult.experiment_run_id == run_id)
    evals = (await db.execute(eval_stmt)).scalars().all()

    tc_ids = [e.test_case_id for e in evals]
    tc_stmt = select(TestCase).where(TestCase.id.in_(tc_ids))
    tcs = {tc.id: tc for tc in (await db.execute(tc_stmt)).scalars().all()}

    failures: list[FailureAnalysisItem] = []
    for e in evals:
        tc = tcs.get(e.test_case_id)
        if not tc:
            continue

        # Check for failure categories
        if e.faithfulness is not None and e.faithfulness < 0.7:
            failures.append(
                FailureAnalysisItem(
                    result_id=e.id,
                    run_id=run_id,
                    test_case_id=tc.id,
                    question=tc.question,
                    ground_truth_answer=tc.ground_truth_answer,
                    generated_answer=e.generated_answer,
                    failure_type="hallucination",
                    score=e.faithfulness,
                    retrieved_chunks=e.retrieved_chunks_json,
                )
            )
        elif e.context_recall is not None and e.context_recall < 0.6:
            failures.append(
                FailureAnalysisItem(
                    result_id=e.id,
                    run_id=run_id,
                    test_case_id=tc.id,
                    question=tc.question,
                    ground_truth_answer=tc.ground_truth_answer,
                    generated_answer=e.generated_answer,
                    failure_type="low_recall",
                    score=e.context_recall,
                    retrieved_chunks=e.retrieved_chunks_json,
                )
            )
        elif e.context_precision is not None and e.context_precision < 0.5:
            failures.append(
                FailureAnalysisItem(
                    result_id=e.id,
                    run_id=run_id,
                    test_case_id=tc.id,
                    question=tc.question,
                    ground_truth_answer=tc.ground_truth_answer,
                    generated_answer=e.generated_answer,
                    failure_type="low_precision",
                    score=e.context_precision,
                    retrieved_chunks=e.retrieved_chunks_json,
                )
            )
        elif e.latency_ms is not None and e.latency_ms > 4000:
            failures.append(
                FailureAnalysisItem(
                    result_id=e.id,
                    run_id=run_id,
                    test_case_id=tc.id,
                    question=tc.question,
                    ground_truth_answer=tc.ground_truth_answer,
                    generated_answer=e.generated_answer,
                    failure_type="high_latency",
                    score=e.latency_ms,
                    retrieved_chunks=e.retrieved_chunks_json,
                )
            )

    return failures
