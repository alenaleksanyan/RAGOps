from __future__ import annotations

import logging
import time
import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.core.redis import get_arq_redis_settings, set_job_progress
from app.models.chunk import DocumentChunk
from app.models.dataset import TestCase, TestDataset
from app.models.document import Document
from app.models.evaluation import EvaluationResult
from app.models.experiment import ExperimentRun, RunStatus
from app.services.chunking.manager import ChunkingManager
from app.services.evaluation.eval_graph import create_rag_evaluation_graph
from app.services.generator.qa_generator import SyntheticDatasetGenerator
from app.services.ingestion.parser import DocumentParserEngine
from app.services.retrieval.vector_store import VectorRetrievalEngine

logger = logging.getLogger(__name__)


# =============================================================================
# Task 1: Ingest, Parse & Chunk Document
# =============================================================================

async def task_process_document(
    ctx: dict[str, Any],
    document_id: str,
    file_bytes: bytes,
    filename: str,
    mime_type: str,
    chunk_strategies: list[dict[str, Any]],
    embedding_provider: str = "openai",
    embedding_model: str = "text-embedding-3-small",
    api_keys: dict[str, str] | None = None,
) -> dict[str, Any]:
    """Background task to parse a document, apply chunking strategies, and index into pgvector."""
    doc_uuid = uuid.UUID(document_id)
    job_id = ctx.get("job_id", str(doc_uuid))

    await set_job_progress(job_id, {"status": "parsing", "progress": 10})

    async with AsyncSessionLocal() as session:
        # 1. Parse document
        parsed = await DocumentParserEngine.parse_bytes(file_bytes, filename, mime_type)

        doc_stmt = select(Document).where(Document.id == doc_uuid)
        res = await session.execute(doc_stmt)
        doc = res.scalar_one_or_none()
        if doc:
            doc.page_count = parsed.page_count
            doc.doc_metadata = parsed.doc_metadata
            doc.status = "processing"
            await session.commit()

        await set_job_progress(job_id, {"status": "chunking", "progress": 40})

        # 2. Execute chunking strategies
        total_chunks = 0
        strategies = chunk_strategies or [{"type": "recursive", "chunk_size": 500, "chunk_overlap": 50}]

        for strat in strategies:
            chunk_results = await ChunkingManager.execute_strategy(
                parsed.documents, strat, api_keys=api_keys
            )
            raw_chunks = [
                {
                    "content": c.content,
                    "chunk_index": c.chunk_index,
                    "strategy_name": c.strategy_name,
                    "token_count": c.token_count,
                    "metadata": c.metadata,
                    "parent_chunk_id": None,
                }
                for c in chunk_results
            ]

            # 3. Embed and store chunks in pgvector
            await set_job_progress(job_id, {"status": "embedding", "progress": 70})
            emb_key = (api_keys or {}).get("embedding_api_key")
            stored_count = await VectorRetrievalEngine.embed_and_store_chunks(
                session=session,
                document_id=doc_uuid,
                chunks=raw_chunks,
                embedding_provider=embedding_provider,
                embedding_model=embedding_model,
                api_key=emb_key,
            )
            total_chunks += stored_count

        if doc:
            doc.status = "ready"
            await session.commit()

        await set_job_progress(job_id, {"status": "completed", "progress": 100, "chunks": total_chunks})
        return {"document_id": document_id, "status": "ready", "total_chunks": total_chunks}


# =============================================================================
# Task 2: Synthetic Benchmark QA Generation
# =============================================================================

async def task_generate_dataset(
    ctx: dict[str, Any],
    dataset_id: str,
    document_id: str,
    num_questions: int = 10,
    provider: str = "openai",
    model_name: str = "gpt-4o-mini",
    api_key: str | None = None,
) -> dict[str, Any]:
    """Background task to generate synthetic test dataset from a document."""
    ds_uuid = uuid.UUID(dataset_id)
    doc_uuid = uuid.UUID(document_id)
    job_id = ctx.get("job_id", str(ds_uuid))

    await set_job_progress(job_id, {"status": "generating_qa", "progress": 20})

    async with AsyncSessionLocal() as session:
        # Fetch document
        doc_stmt = select(Document).where(Document.id == doc_uuid)
        doc = (await session.execute(doc_stmt)).scalar_one_or_none()

        # Fetch all document chunks ordered by chunk_index
        stmt = (
            select(DocumentChunk)
            .where(DocumentChunk.document_id == doc_uuid)
            .order_by(DocumentChunk.chunk_index.asc())
        )
        res = await session.execute(stmt)
        all_chunks = res.scalars().all()

        if not all_chunks:
            raise ValueError(f"No chunks found for document {document_id}")

        # Strategy-aware deduplication: if parent chunks exist, prioritize them
        parent_chunks = [c for c in all_chunks if "parent" in (c.chunk_strategy or "").lower() and c.parent_chunk_id is None]
        if parent_chunks:
            candidate_chunks = parent_chunks
        else:
            strat_names = {c.chunk_strategy for c in all_chunks if c.chunk_strategy}
            first_strat = next(iter(strat_names)) if strat_names else None
            candidate_chunks = [c for c in all_chunks if c.chunk_strategy == first_strat] if first_strat else all_chunks

        chunk_texts = [c.content for c in candidate_chunks]

        # Generate QA pairs with dynamic windowing and global anchoring
        qa_pairs = await SyntheticDatasetGenerator.generate_dataset(
            chunks=chunk_texts,
            num_questions=num_questions,
            provider=provider,
            model_name=model_name,
            doc_title=doc.filename if doc else None,
            doc_metadata=doc.doc_metadata if doc else None,
            api_key=api_key,
        )

        await set_job_progress(job_id, {"status": "saving_test_cases", "progress": 80})

        # Save test cases to database
        saved_cases = []
        for pair in qa_pairs:
            tc = TestCase(
                dataset_id=ds_uuid,
                question=pair.question,
                ground_truth_answer=pair.ground_truth_answer,
                expected_context=pair.expected_context,
                question_type=pair.question_type,
            )
            session.add(tc)
            saved_cases.append(tc)

        await session.commit()
        await set_job_progress(job_id, {"status": "completed", "progress": 100, "count": len(saved_cases)})
        return {"dataset_id": dataset_id, "cases_created": len(saved_cases)}


# =============================================================================
# Task 3: Experiment Run Execution Pipeline
# =============================================================================

async def task_run_experiment(
    ctx: dict[str, Any],
    experiment_run_id: str,
) -> dict[str, Any]:
    """Execute evaluation across all test cases for an experiment run configuration."""
    run_uuid = uuid.UUID(experiment_run_id)
    job_id = ctx.get("job_id", str(run_uuid))

    eval_graph = create_rag_evaluation_graph()

    async with AsyncSessionLocal() as session:
        stmt = select(ExperimentRun).where(ExperimentRun.id == run_uuid)
        res = await session.execute(stmt)
        exp_run = res.scalar_one_or_none()
        if not exp_run:
            logger.info(f"ExperimentRun {experiment_run_id} no longer exists (deleted by user). Skipping job cleanly.")
            return {"experiment_run_id": experiment_run_id, "status": "SKIPPED"}

        exp_run.status = RunStatus.RUNNING
        exp_run.started_at = datetime.now(UTC)
        await session.commit()

        # Fetch test cases for dataset
        tc_stmt = select(TestCase).where(TestCase.dataset_id == exp_run.dataset_id)
        tc_res = await session.execute(tc_stmt)
        test_cases = tc_res.scalars().all()

        exp_run.total_test_cases = len(test_cases)
        exp_run.completed_cases = 0
        await session.commit()

        cfg = exp_run.pipeline_config or {}
        user_api_keys = cfg.get("user_api_keys", {})

        embedding_prov = cfg.get("embedding_provider", "openai")
        embedding_model = cfg.get("embedding_model", "text-embedding-3-small")
        retrieval_k = cfg.get("retrieval_k", 5)
        distance_metric = cfg.get("distance_metric", "cosine")
        chunk_strat = cfg.get("chunk_strategy")
        reranker = cfg.get("reranker")
        is_hybrid = (
            cfg.get("retrieval_mode") == "hybrid"
            or cfg.get("rag_mode") == "hybrid"
            or cfg.get("hybrid") is True
            or (reranker == "hybrid")
        )
        if reranker == "hybrid":
            reranker = None

        try:
            for idx, tc in enumerate(test_cases):
                # 1. Retrieve relevant chunks
                t_ret_start = time.perf_counter()
                retrieved = await VectorRetrievalEngine.retrieve(
                    session=session,
                    query=tc.question,
                    strategy=chunk_strat,
                    embedding_provider=embedding_prov,
                    embedding_model=embedding_model,
                    k=retrieval_k,
                    distance_metric=distance_metric,
                    reranker=reranker,
                    api_key=user_api_keys.get("embedding_api_key"),
                    hybrid=is_hybrid,
                )
                ret_latency_ms = (time.perf_counter() - t_ret_start) * 1000.0

                retrieved_dicts = [
                    {
                        "chunk_id": c.chunk_id,
                        "content": c.content,
                        "score": c.score,
                        "rank": c.rank,
                        "parent_content": c.parent_content,
                    }
                    for c in retrieved
                ]

                # 2. Run LangGraph Multi-Metric Evaluation
                init_state = {
                    "question": tc.question,
                    "ground_truth_answer": tc.ground_truth_answer,
                    "expected_context": tc.expected_context,
                    "document_id": None,
                    "pipeline_config": cfg,
                    "user_api_keys": user_api_keys,
                    "retrieved_chunks": retrieved_dicts,
                    "context_text": "",
                    "generated_answer": "",
                    "context_precision": 0.0,
                    "context_recall": 0.0,
                    "faithfulness": 0.0,
                    "answer_relevance": 0.0,
                    "retrieval_latency_ms": ret_latency_ms,
                    "generation_latency_ms": 0.0,
                    "ttft_ms": 0.0,
                    "total_latency_ms": 0.0,
                    "prompt_tokens": 0,
                    "completion_tokens": 0,
                    "total_tokens": 0,
                    "estimated_cost_usd": 0.0,
                    "error_message": None,
                }

                try:
                    final_state = await eval_graph.ainvoke(init_state)

                    eval_result = EvaluationResult(
                        experiment_run_id=run_uuid,
                        test_case_id=tc.id,
                        generated_answer=final_state.get("generated_answer"),
                        retrieved_chunks_json=retrieved_dicts,
                        context_precision=final_state.get("context_precision"),
                        context_recall=final_state.get("context_recall"),
                        faithfulness=final_state.get("faithfulness"),
                        answer_relevance=final_state.get("answer_relevance"),
                        latency_ms=final_state.get("total_latency_ms"),
                        ttft_ms=final_state.get("ttft_ms"),
                        retrieval_latency_ms=final_state.get("retrieval_latency_ms"),
                        total_tokens=final_state.get("total_tokens"),
                        prompt_tokens=final_state.get("prompt_tokens"),
                        completion_tokens=final_state.get("completion_tokens"),
                        estimated_cost_usd=final_state.get("estimated_cost_usd"),
                    )
                except Exception as e:
                    logger.error(f"Evaluation error on test case {tc.id}: {e}")
                    eval_result = EvaluationResult(
                        experiment_run_id=run_uuid,
                        test_case_id=tc.id,
                        error_message=str(e),
                    )

                session.add(eval_result)
                exp_run.completed_cases = idx + 1
                await session.commit()

                progress_pct = int(((idx + 1) / len(test_cases)) * 100)
                await set_job_progress(
                    job_id,
                    {"status": "running", "completed": idx + 1, "total": len(test_cases), "progress": progress_pct},
                )

            exp_run.status = RunStatus.COMPLETED
            exp_run.completed_at = datetime.now(UTC)
            await session.commit()
            await set_job_progress(job_id, {"status": "completed", "progress": 100})
            return {"experiment_run_id": experiment_run_id, "status": "COMPLETED"}

        except Exception as run_err:
            logger.error(f"Fatal run execution error for run {run_uuid}: {run_err}")
            exp_run.status = RunStatus.FAILED
            exp_run.error_message = str(run_err)
            await session.commit()
            await set_job_progress(job_id, {"status": "failed", "error": str(run_err)})
            raise


# =============================================================================
# ARQ Worker Settings
# =============================================================================

class WorkerSettings:
    functions = [task_process_document, task_generate_dataset, task_run_experiment]
    redis_settings = get_arq_redis_settings()
    max_jobs = 10
    job_timeout = 1800  # 30 mins
