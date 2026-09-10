from __future__ import annotations

import asyncio
import itertools
import uuid
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal, get_db
from app.core.redis import get_job_progress
from app.models.dataset import TestCase, TestDataset
from app.models.evaluation import EvaluationResult
from app.models.experiment import ExperimentRun, RunStatus
from app.schemas.experiment import (
    EvaluationResultResponse,
    ExperimentRunCreate,
    ExperimentRunResponse,
    ExperimentStatusResponse,
    SingleRunTriggerRequest,
)
from app.workers.arq_worker import task_run_experiment

router = APIRouter(prefix="/experiments", tags=["Experimentation & Evaluation"])


def _calculate_run_metrics(run: ExperimentRun, results: list[EvaluationResult]) -> ExperimentRunResponse:
    """Helper to aggregate average metrics for an experiment run."""
    resp = ExperimentRunResponse.from_orm(run)
    if not results:
        return resp

    precisions = [r.context_precision for r in results if r.context_precision is not None]
    recalls = [r.context_recall for r in results if r.context_recall is not None]
    faiths = [r.faithfulness for r in results if r.faithfulness is not None]
    relevances = [r.answer_relevance for r in results if r.answer_relevance is not None]
    latencies = [r.latency_ms for r in results if r.latency_ms is not None]
    costs = [r.estimated_cost_usd for r in results if r.estimated_cost_usd is not None]

    resp.avg_context_precision = sum(precisions) / len(precisions) if precisions else None
    resp.avg_context_recall = sum(recalls) / len(recalls) if recalls else None
    resp.avg_faithfulness = sum(faiths) / len(faiths) if faiths else None
    resp.avg_answer_relevance = sum(relevances) / len(relevances) if relevances else None
    resp.avg_latency_ms = sum(latencies) / len(latencies) if latencies else None
    resp.total_cost_usd = sum(costs) if costs else 0.0
    return resp


@router.post("/matrix", response_model=list[ExperimentRunResponse], status_code=status.HTTP_201_CREATED)
async def trigger_matrix_run(
    req: ExperimentRunCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """Trigger a combinatorial experimentation matrix evaluation across chunking strategies,
    embedding models, retrieval k values, rerankers, and generator LLMs.
    """
    ds_stmt = select(TestDataset).where(TestDataset.id == req.dataset_id)
    ds = (await db.execute(ds_stmt)).scalar_one_or_none()
    if not ds:
        raise HTTPException(status_code=404, detail="Dataset not found")

    m = req.matrix
    chunk_strats = m.chunking_strategies or [{"type": "recursive", "chunk_size": 500, "chunk_overlap": 50}]
    emb_models = m.embedding_models or ["text-embedding-3-small"]
    emb_providers = m.embedding_providers or ["openai"]
    k_vals = m.retrieval_k or [5]
    rerankers = m.rerankers if m.rerankers is not None else [None]
    llm_models = m.llm_models or ["gpt-4o-mini"]
    llm_providers = m.llm_providers or ["openai"]

    created_runs: list[ExperimentRun] = []

    # Cartesian product expansion
    for strat, (emb_p, emb_m), k_val, reranker, (llm_p, llm_m) in itertools.product(
        chunk_strats,
        zip(emb_providers, emb_models, strict=False) if len(emb_providers) == len(emb_models) else [(emb_providers[0], m) for m in emb_models],
        k_vals,
        rerankers,
        zip(llm_providers, llm_models, strict=False) if len(llm_providers) == len(llm_models) else [(llm_providers[0], m) for m in llm_models],
    ):
        stype = strat.get("type", "recursive")
        run_name = f"{stype} | {emb_m} | k={k_val} | rerank={reranker or 'none'} | {llm_m}"

        pipe_cfg = {
            "chunk_strategy": stype,
            "chunk_config": strat,
            "embedding_provider": emb_p,
            "embedding_model": emb_m,
            "retrieval_k": k_val,
            "distance_metric": "cosine",
            "reranker": reranker,
            "llm_provider": llm_p,
            "llm_model": llm_m,
            "user_api_keys": m.user_api_keys,
        }

        run_id = uuid.uuid4()
        exp_run = ExperimentRun(
            id=run_id,
            dataset_id=req.dataset_id,
            name=run_name,
            status=RunStatus.PENDING,
            pipeline_config=pipe_cfg,
        )
        db.add(exp_run)
        created_runs.append(exp_run)

    await db.commit()

    # Launch async background evaluation execution via ARQ worker or in-process fallback
    from app.core.redis import get_arq_pool

    arq_pool = await get_arq_pool()
    for r in created_runs:
        await db.refresh(r)
        enqueued = False
        if arq_pool:
            try:
                await arq_pool.enqueue_job("task_run_experiment", experiment_run_id=str(r.id))
                enqueued = True
            except Exception:
                enqueued = False
        if not enqueued:
            background_tasks.add_task(task_run_experiment, {}, str(r.id))

    return [ExperimentRunResponse.from_orm(r) for r in created_runs]


@router.post("/run", response_model=ExperimentRunResponse, status_code=status.HTTP_201_CREATED)
async def trigger_single_run(
    req: SingleRunTriggerRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """Trigger a single RAG pipeline evaluation run."""
    run_id = uuid.uuid4()
    exp_run = ExperimentRun(
        id=run_id,
        dataset_id=req.dataset_id,
        name=req.name or f"Run {str(run_id)[:8]}",
        status=RunStatus.PENDING,
        pipeline_config=req.pipeline_config,
    )
    db.add(exp_run)
    await db.commit()
    await db.refresh(exp_run)

    from app.core.redis import get_arq_pool

    arq_pool = await get_arq_pool()
    enqueued = False
    if arq_pool:
        try:
            await arq_pool.enqueue_job("task_run_experiment", experiment_run_id=str(run_id))
            enqueued = True
        except Exception:
            enqueued = False
    if not enqueued:
        background_tasks.add_task(task_run_experiment, {}, str(run_id))

    return ExperimentRunResponse.from_orm(exp_run)


@router.get("", response_model=list[ExperimentRunResponse])
async def list_experiments(
    dataset_id: uuid.UUID | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    """List all experiment runs with average metric aggregations."""
    stmt = select(ExperimentRun)
    if dataset_id:
        stmt = stmt.where(ExperimentRun.dataset_id == dataset_id)
    stmt = stmt.order_by(ExperimentRun.created_at.desc())

    runs = (await db.execute(stmt)).scalars().all()

    results: list[ExperimentRunResponse] = []
    for r in runs:
        eval_stmt = select(EvaluationResult).where(EvaluationResult.experiment_run_id == r.id)
        evals = (await db.execute(eval_stmt)).scalars().all()
        results.append(_calculate_run_metrics(r, evals))

    return results


@router.get("/{run_id}", response_model=ExperimentRunResponse)
async def get_experiment(
    run_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Get experiment details and aggregated metrics."""
    stmt = select(ExperimentRun).where(ExperimentRun.id == run_id)
    run = (await db.execute(stmt)).scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Experiment run not found")

    eval_stmt = select(EvaluationResult).where(EvaluationResult.experiment_run_id == run.id)
    evals = (await db.execute(eval_stmt)).scalars().all()
    return _calculate_run_metrics(run, evals)


@router.get("/{run_id}/status", response_model=ExperimentStatusResponse)
async def get_experiment_status(
    run_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Poll the real-time execution progress of an experiment run."""
    stmt = select(ExperimentRun).where(ExperimentRun.id == run_id)
    run = (await db.execute(stmt)).scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Experiment run not found")

    total = run.total_test_cases or 1
    completed = run.completed_cases or 0
    pct = int((completed / total) * 100) if total > 0 else 0

    return ExperimentStatusResponse(
        id=run.id,
        status=run.status,
        total=run.total_test_cases,
        completed=run.completed_cases,
        progress_percentage=min(100, max(0, pct)),
        started_at=run.started_at,
        completed_at=run.completed_at,
    )


@router.get("/{run_id}/results", response_model=list[EvaluationResultResponse])
async def get_experiment_results(
    run_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Retrieve full per-test-case evaluation results for an experiment run."""
    stmt = select(ExperimentRun).where(ExperimentRun.id == run_id)
    run = (await db.execute(stmt)).scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Experiment run not found")

    eval_stmt = (
        select(EvaluationResult, TestCase)
        .outerjoin(TestCase, EvaluationResult.test_case_id == TestCase.id)
        .where(EvaluationResult.experiment_run_id == run_id)
        .order_by(EvaluationResult.created_at.asc())
    )
    res = await db.execute(eval_stmt)
    rows = res.all()

    results: list[EvaluationResultResponse] = []
    for eval_item, test_case in rows:
        resp = EvaluationResultResponse.from_orm(eval_item)
        if test_case:
            resp.question = test_case.question
            resp.ground_truth_answer = test_case.ground_truth_answer
            resp.question_type = test_case.question_type
        results.append(resp)

    return results


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
async def delete_all_experiments(
    db: AsyncSession = Depends(get_db),
):
    """Bulk delete all experiment runs and clear queued jobs."""
    stmt = select(ExperimentRun)
    runs = (await db.execute(stmt)).scalars().all()
    for r in runs:
        await db.delete(r)
    await db.commit()

    # Clear stale redis job keys
    try:
        from app.core.redis import get_redis

        r = await get_redis()
        keys = await r.keys("arq:*")
        if keys:
            await r.delete(*keys)
    except Exception:
        pass

    return None


@router.delete("/{run_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_experiment(
    run_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Delete an experiment run and all its evaluation results."""
    stmt = select(ExperimentRun).where(ExperimentRun.id == run_id)
    run = (await db.execute(stmt)).scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Experiment run not found")

    await db.delete(run)
    await db.commit()
    return None
