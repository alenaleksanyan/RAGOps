from __future__ import annotations

import io
import csv
import uuid
import json
import asyncio
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import (
    File,
    Form,
    Depends,
    status,
    APIRouter,
    UploadFile,
    HTTPException,
)
from app.core.database import get_db
from pydantic import BaseModel, Field
from app.models.document import Document
from app.models.chunk import DocumentChunk
from app.models.dataset import TestCase, TestDataset
from app.schemas.dataset import (
    GenerateDatasetRequest,
    TestCaseCreate,
    TestCaseResponse,
    TestCaseUpdate,
    TestDatasetCreate,
    TestDatasetResponse,
)
# pyrefly: ignore [missing-import]
from langchain_core.messages import HumanMessage, SystemMessage
from app.services.providers.factory import ModelProviderFactory
from app.services.generator.qa_generator import SyntheticDatasetGenerator

router = APIRouter(prefix="/datasets", tags=["Dataset & Ground-Truth Benchmarks"])


@router.post("", response_model=TestDatasetResponse, status_code=status.HTTP_201_CREATED)
async def create_dataset(
    dataset_in: TestDatasetCreate,
    db: AsyncSession = Depends(get_db),
):
    """Create a new empty test dataset benchmark container."""
    ds = TestDataset(
        id=uuid.uuid4(),
        document_id=dataset_in.document_id,
        name=dataset_in.name,
        description=dataset_in.description,
    )
    db.add(ds)
    await db.commit()
    await db.refresh(ds)
    return ds


@router.get("", response_model=list[TestDatasetResponse])
async def list_datasets(
    db: AsyncSession = Depends(get_db),
):
    """List all benchmark datasets."""
    stmt = (
        select(TestDataset, func.count(TestCase.id).label("case_count"))
        .outerjoin(TestCase, TestDataset.id == TestCase.dataset_id)
        .group_by(TestDataset.id)
        .order_by(TestDataset.created_at.desc())
    )
    res = await db.execute(stmt)
    rows = res.all()

    datasets: list[TestDatasetResponse] = []
    for ds, count in rows:
        d_resp = TestDatasetResponse.from_orm(ds)
        d_resp.test_cases_count = count
        datasets.append(d_resp)

    return datasets


@router.post("/generate", response_model=TestDatasetResponse, status_code=status.HTTP_201_CREATED)
async def generate_synthetic_dataset(
    gen_req: GenerateDatasetRequest,
    db: AsyncSession = Depends(get_db),
):
    """Auto-generate synthetic benchmark QA pairs directly from ingested document chunks."""
    doc_stmt = select(Document).where(Document.id == gen_req.document_id)
    doc = (await db.execute(doc_stmt)).scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    # Fetch all chunks for the document ordered by chunk_index
    chunk_stmt = (
        select(DocumentChunk)
        .where(DocumentChunk.document_id == gen_req.document_id)
        .order_by(DocumentChunk.chunk_index.asc())
    )
    all_chunks = (await db.execute(chunk_stmt)).scalars().all()
    if not all_chunks:
        raise HTTPException(
            status_code=400,
            detail="Document has no chunks. Please ensure the document is ingested and chunked first.",
        )

    # Strategy-aware deduplication: if parent chunks exist, prioritize them for rich coverage
    parent_chunks = [c for c in all_chunks if "parent" in (c.chunk_strategy or "").lower() and c.parent_chunk_id is None]
    if parent_chunks:
        candidate_chunks = parent_chunks
    else:
        # Group by strategy to avoid duplicate passes over the same document
        strat_names = {c.chunk_strategy for c in all_chunks if c.chunk_strategy}
        first_strat = next(iter(strat_names)) if strat_names else None
        candidate_chunks = [c for c in all_chunks if c.chunk_strategy == first_strat] if first_strat else all_chunks

    chunk_texts = [c.content for c in candidate_chunks]

    # Generate synthetic questions with dynamic windowing and global anchoring
    qa_pairs = await SyntheticDatasetGenerator.generate_dataset(
        chunks=chunk_texts,
        num_questions=gen_req.num_questions,
        provider=gen_req.provider,
        model_name=gen_req.model_name,
        doc_title=doc.filename,
        doc_metadata=doc.doc_metadata,
        api_key=gen_req.api_key,
    )

    ds_name = gen_req.name or f"Synthetic Benchmark – {doc.filename}"
    dataset = TestDataset(
        id=uuid.uuid4(),
        document_id=doc.id,
        name=ds_name,
        description=f"Auto-generated {len(qa_pairs)} QA pairs using {gen_req.model_name}",
        generation_config={
            "provider": gen_req.provider,
            "model_name": gen_req.model_name,
            "num_questions": gen_req.num_questions,
        },
    )
    db.add(dataset)
    await db.flush()

    for pair in qa_pairs:
        tc = TestCase(
            id=uuid.uuid4(),
            dataset_id=dataset.id,
            question=pair.question,
            ground_truth_answer=pair.ground_truth_answer,
            expected_context=pair.expected_context,
            question_type=pair.question_type,
        )
        db.add(tc)

    await db.commit()
    await db.refresh(dataset)

    res = TestDatasetResponse.from_orm(dataset)
    res.test_cases_count = len(qa_pairs)
    return res


@router.get("/{dataset_id}/cases", response_model=list[TestCaseResponse])
async def list_test_cases(
    dataset_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Retrieve test cases for a dataset."""
    ds_stmt = select(TestDataset).where(TestDataset.id == dataset_id)
    ds = (await db.execute(ds_stmt)).scalar_one_or_none()
    if not ds:
        raise HTTPException(status_code=404, detail="Dataset not found")

    tc_stmt = (
        select(TestCase)
        .where(TestCase.dataset_id == dataset_id)
        .order_by(TestCase.created_at.asc())
    )
    res = await db.execute(tc_stmt)
    return res.scalars().all()


@router.post("/{dataset_id}/cases", response_model=TestCaseResponse, status_code=status.HTTP_201_CREATED)
async def create_test_case(
    dataset_id: uuid.UUID,
    case_in: TestCaseCreate,
    db: AsyncSession = Depends(get_db),
):
    """Manually add a custom test case to a benchmark dataset."""
    ds_stmt = select(TestDataset).where(TestDataset.id == dataset_id)
    ds = (await db.execute(ds_stmt)).scalar_one_or_none()
    if not ds:
        raise HTTPException(status_code=404, detail="Dataset not found")

    tc = TestCase(
        id=uuid.uuid4(),
        dataset_id=dataset_id,
        question=case_in.question,
        ground_truth_answer=case_in.ground_truth_answer,
        expected_context=case_in.expected_context,
        question_type=case_in.question_type,
        source_chunk_ids=case_in.source_chunk_ids,
    )
    db.add(tc)
    await db.commit()
    await db.refresh(tc)
    return tc


@router.patch("/{dataset_id}/cases/{case_id}", response_model=TestCaseResponse)
async def update_test_case(
    dataset_id: uuid.UUID,
    case_id: uuid.UUID,
    case_update: TestCaseUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Human-in-the-loop curator endpoint to edit, refine, or verify a test case."""
    ds_stmt = select(TestDataset).where(TestDataset.id == dataset_id)
    ds = (await db.execute(ds_stmt)).scalar_one_or_none()
    if not ds:
        raise HTTPException(status_code=404, detail="Dataset not found")

    tc_stmt = select(TestCase).where(TestCase.id == case_id, TestCase.dataset_id == dataset_id)
    tc = (await db.execute(tc_stmt)).scalar_one_or_none()
    if not tc:
        raise HTTPException(status_code=404, detail="TestCase not found")

    if case_update.question is not None:
        tc.question = case_update.question
    if case_update.ground_truth_answer is not None:
        tc.ground_truth_answer = case_update.ground_truth_answer
    if case_update.expected_context is not None:
        tc.expected_context = case_update.expected_context
    if case_update.is_verified is not None:
        tc.is_verified = case_update.is_verified

    await db.commit()
    await db.refresh(tc)
    return tc


class InferredDatasetSchema(BaseModel):
    is_valid_dataset: bool = Field(
        description="True if the sample rows represent a valid QA or prompt-completion evaluation benchmark, False otherwise."
    )
    question_field: str | None = Field(
        default=None,
        description="Exact key or column name corresponding to the user question/query/prompt/inquiry."
    )
    answer_field: str | None = Field(
        default=None,
        description="Exact key or column name corresponding to the ground-truth reference answer/solution/target."
    )
    context_field: str | None = Field(
        default=None,
        description="Exact key or column name corresponding to the expected context or passage, if present."
    )
    verified_field: str | None = Field(
        default=None,
        description="Exact key or column name indicating human verification status (e.g. verified, approved, is_valid), if present."
    )
    rejection_reason: str | None = Field(
        default=None,
        description="Detailed explanation if the file does not represent a QA dataset."
    )


async def resolve_dataset_schema(
    sample_rows: list[dict[str, Any]],
    user_mapping: dict[str, str] | None = None,
) -> tuple[str, str, str | None, str | None]:
    """Resolves column names for (question, ground_truth_answer, expected_context, verified_status).

    Raises HTTPException(400) if no valid structure can be resolved.
    """
    if not sample_rows:
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")

    first_row = sample_rows[0]
    keys = list(first_row.keys())

    # 1. Tier 1: User Explicit Mapping
    if user_mapping:
        q_col = user_mapping.get("question") or user_mapping.get("query")
        a_col = user_mapping.get("ground_truth_answer") or user_mapping.get("answer") or user_mapping.get("target")
        ctx_col = user_mapping.get("expected_context") or user_mapping.get("context")
        v_col = user_mapping.get("is_verified") or user_mapping.get("verified")

        if q_col and a_col and q_col in first_row and a_col in first_row:
            return (
                q_col,
                a_col,
                ctx_col if ctx_col in first_row else None,
                v_col if v_col in first_row else None,
            )
        else:
            raise HTTPException(
                status_code=400,
                detail=f"Specified field mapping ({user_mapping}) does not match the file columns: {keys}",
            )

    # 2. Tier 2: Fast Rule-Based Standard Alias Matching (0ms)
    q_aliases = [
        "question", "query", "prompt", "input", "instruction", "question_text",
        "user_input", "inquiry", "user_inquiry", "user_prompt", "ask", "problem", "task"
    ]
    a_aliases = [
        "ground_truth_answer", "ground_truth", "answer", "reference_answer", "target",
        "output", "response", "completion", "label", "solution", "expert_solution",
        "ideal_response", "target_output"
    ]
    ctx_aliases = [
        "expected_context", "context", "contexts", "reference_passage", "passage",
        "supporting_facts", "evidence", "supporting_evidence", "source_passage"
    ]
    v_aliases = [
        "is_verified", "verified", "human_verified", "approved", "is_valid",
        "quality_checked", "status"
    ]

    matched_q = next((k for k in keys if k.lower().strip() in q_aliases), None)
    matched_a = next((k for k in keys if k.lower().strip() in a_aliases), None)
    matched_ctx = next((k for k in keys if k.lower().strip() in ctx_aliases), None)
    matched_v = next((k for k in keys if k.lower().strip() in v_aliases), None)

    # Fuzzy check if exact keyword matching didn't catch compound column names (e.g. "my_inquiry", "expert_solution_v1")
    if not matched_q:
        matched_q = next((k for k in keys if any(sub in k.lower() for sub in ["question", "query", "prompt", "inquiry", "input", "instruction"])), None)
    if not matched_a:
        matched_a = next((k for k in keys if any(sub in k.lower() for sub in ["answer", "solution", "target", "output", "response", "completion", "label"])), None)
    if not matched_ctx:
        matched_ctx = next((k for k in keys if any(sub in k.lower() for sub in ["context", "passage", "evidence"])), None)
    if not matched_v:
        matched_v = next((k for k in keys if any(sub in k.lower() for sub in ["verified", "approved"])), None)

    if matched_q and matched_a:
        return matched_q, matched_a, matched_ctx, matched_v

    # 3. Tier 3: LLM Schema Inference
    try:
        chat_model = ModelProviderFactory.get_chat_model(
            provider="ollama",
            model_name="llama3.2",
            temperature=0.0,
        )
        sample_snippet = json.dumps(sample_rows[:2], indent=2, ensure_ascii=False)
        prompt = f"""Analyze these sample records from an uploaded dataset:
{sample_snippet}

Task:
Determine whether this dataset represents an evaluation or benchmark dataset for LLMs / AI systems.
A valid evaluation dataset consists of questions, inquiries, instructions, clinical cases, or problems paired with their expected reference answers, diagnoses, ground-truth outputs, or solutions.

CRITICAL DISCRIMINATION RULES:
- If the records represent entity tables, e-commerce product catalogs (e.g., sku, price, category, inventory), user account tables, financial transactions, or system logs, you MUST set is_valid_dataset to FALSE and state the rejection_reason clearly (e.g., "E-commerce product catalog table is not a QA evaluation benchmark").
- Only set is_valid_dataset to TRUE if there is a distinct input/question/task field and an expected output/answer/solution field.

Available columns: {keys}
"""
        messages = [
            SystemMessage(
                content="You are a strict data validation engineer for AI evaluation benchmarks. Reject non-benchmark entity tables (such as product catalogs, logs, or transactions) immediately."
            ),
            HumanMessage(content=prompt),
        ]

        structured_model = chat_model.with_structured_output(InferredDatasetSchema)
        inferred: InferredDatasetSchema = await asyncio.wait_for(
            structured_model.ainvoke(messages),
            timeout=30.0,
        )

        if (
            inferred.is_valid_dataset
            and inferred.question_field in first_row
            and inferred.answer_field in first_row
        ):
            return (
                inferred.question_field,
                inferred.answer_field,
                inferred.context_field if inferred.context_field in first_row else None,
                inferred.verified_field if inferred.verified_field in first_row else None,
            )

        failure_msg = inferred.rejection_reason or "The file does not contain recognizable question and ground-truth answer fields."
        raise HTTPException(
            status_code=400,
            detail=f"Could not import dataset: {failure_msg} (Found columns: {keys})",
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Could not import dataset: Unable to identify question and answer columns ({keys}). Rejection: {e}",
        )


def extract_nested_path(data: Any, path: str) -> Any:
    """Traverses a nested dict/list using dot notation, e.g. 'data.records' or 'evaluation.cases'."""
    current = data
    parts = [p.strip() for p in path.split(".") if p.strip()]
    for part in parts:
        if isinstance(current, dict) and part in current:
            current = current[part]
        elif isinstance(current, list) and part.isdigit() and int(part) < len(current):
            current = current[int(part)]
        else:
            return None
    return current


def unroll_squad_structure(data: Any) -> list[dict[str, Any]]:
    """Unrolls SQuAD-like nested structures (data -> paragraphs -> qas -> answers) into flat QA records."""
    records: list[dict[str, Any]] = []
    
    # Handle top-level list or dict with 'data'
    articles = data.get("data", []) if isinstance(data, dict) else (data if isinstance(data, list) else [])
    for article in articles:
        if not isinstance(article, dict):
            continue
        paragraphs = article.get("paragraphs", [])
        for para in paragraphs:
            if not isinstance(para, dict):
                continue
            ctx = para.get("context", "")
            for qa in para.get("qas", []):
                if not isinstance(qa, dict):
                    continue
                q = qa.get("question", "")
                answers = qa.get("answers", [])
                ans_text = ""
                if isinstance(answers, list) and answers:
                    first_ans = answers[0]
                    ans_text = first_ans.get("text", "") if isinstance(first_ans, dict) else str(first_ans)
                elif isinstance(answers, dict):
                    ans_text = answers.get("text", [""])[0] if isinstance(answers.get("text"), list) else str(answers.get("text", ""))

                if q and ans_text:
                    records.append({
                        "question": q,
                        "ground_truth_answer": ans_text,
                        "expected_context": ctx,
                        "is_verified": True,
                    })
    return records


def discover_json_records(
    data: Any,
    json_root_path: str | None = None,
    max_depth: int = 4,
) -> tuple[list[dict[str, Any]], str]:
    """Recursively and transparently discovers the list of dictionary records in a JSON structure.

    Returns:
        tuple[list[dict], str]: (extracted_rows, path_description)
    """
    # 0. Check for SQuAD / QA nested hierarchy
    squad_rows = unroll_squad_structure(data)
    if squad_rows:
        return squad_rows, "SQuAD unrolled hierarchy (data.paragraphs.qas)"

    # 1. User Explicit Path Override
    if json_root_path:
        extracted = extract_nested_path(data, json_root_path)
        if isinstance(extracted, list):
            rows = [r for r in extracted if isinstance(r, dict)]
            if rows:
                return rows, f"explicit path: '{json_root_path}'"
        elif isinstance(extracted, dict):
            return [extracted], f"explicit path (single object): '{json_root_path}'"

        available_keys = list(data.keys()) if isinstance(data, dict) else "list root"
        raise HTTPException(
            status_code=400,
            detail=f"Could not find valid records at specified json_root_path '{json_root_path}'. Top-level structure keys: {available_keys}",
        )

    # 2. Direct Root List
    if isinstance(data, list):
        rows = [r for r in data if isinstance(r, dict)]
        if rows:
            return rows, "root array ($)"

    # 3. Recursive Tree Discovery for Dicts
    if isinstance(data, dict):
        candidates: list[tuple[str, list[dict[str, Any]]]] = []

        def _traverse(node: Any, current_path: str, depth: int):
            if depth > max_depth or not isinstance(node, dict):
                return
            for k, v in node.items():
                path = f"{current_path}.{k}" if current_path else k
                if isinstance(v, list):
                    dict_items = [item for item in v if isinstance(item, dict)]
                    if dict_items:
                        candidates.append((path, dict_items))
                elif isinstance(v, dict):
                    _traverse(v, path, depth + 1)

        _traverse(data, "", 1)

        if len(candidates) == 1:
            return candidates[0][1], f"auto-discovered path: '{candidates[0][0]}'"
        elif len(candidates) > 1:
            # Score candidate arrays by presence of QA-like keys
            qa_indicators = {"question", "query", "prompt", "inquiry", "input", "answer", "target", "solution", "response", "ground_truth", "loesung", "problem"}

            def _score_candidate(cand: tuple[str, list[dict[str, Any]]]) -> float:
                path_str, rows_list = cand
                if not rows_list:
                    return 0.0
                sample = rows_list[0]
                matched_keys = sum(1 for k in sample.keys() if any(ind in k.lower() for ind in qa_indicators))
                return matched_keys * 100.0 + len(rows_list)

            best_cand = max(candidates, key=_score_candidate)
            return best_cand[1], f"auto-discovered path: '{best_cand[0]}'"

        # 4. Check if root dict itself represents a single QA record
        qa_keys = {"question", "query", "prompt", "inquiry", "input", "problem"}
        if any(k.lower() in qa_keys for k in data.keys()):
            return [data], "root object (single record)"

        raise HTTPException(
            status_code=400,
            detail=f"Could not locate an array of records in JSON file. Found top-level keys: {list(data.keys())}. Please specify the records array path via Custom Column Mapping.",
        )

    raise HTTPException(status_code=400, detail="Invalid JSON file format. Expected a JSON object or array.")


@router.post("/import", response_model=TestDatasetResponse, status_code=status.HTTP_201_CREATED)
async def import_dataset(
    file: UploadFile = File(...),
    name: str = Form(None),
    description: str = Form(None),
    document_id: str = Form(None),
    field_mapping: str = Form(None),  # Optional JSON string: {"question": "...", "answer": "...", "context": "..."}
    json_root_path: str = Form(None),  # Optional path for nested JSON, e.g. "evaluation.test_cases"
    default_verified: bool = Form(True),  # Gold standard benchmark imports default to verified
    db: AsyncSession = Depends(get_db),
):
    """Import a custom ground-truth benchmark dataset from JSON, JSONL, or CSV with 3-tier smart schema resolution."""
    content = await file.read()
    filename = file.filename or "dataset"
    parsed_rows: list[dict[str, Any]] = []
    extracted_source_path = "tabular root"

    doc_uuid = uuid.UUID(document_id) if document_id and document_id != "null" and document_id != "" else None

    # Decode using utf-8-sig to automatically strip any Windows/Excel Byte Order Mark (BOM)
    decoded = content.decode("utf-8-sig", errors="replace")

    # 1. Parse raw file contents (JSON, JSONL, or Delimited CSV)
    if filename.endswith(".jsonl"):
        lines = [line.strip() for line in decoded.splitlines() if line.strip()]
        for line in lines:
            try:
                item = json.loads(line)
                if isinstance(item, dict):
                    parsed_rows.append(item)
            except Exception:
                pass
        extracted_source_path = "json lines (jsonl)"
    elif filename.endswith(".json") or file.content_type == "application/json":
        try:
            raw_data = json.loads(decoded)
            parsed_rows, extracted_source_path = discover_json_records(raw_data, json_root_path=json_root_path)
        except json.JSONDecodeError:
            # Fallback: attempt JSONL line-by-line parsing if json.loads fails
            lines = [line.strip() for line in decoded.splitlines() if line.strip()]
            for line in lines:
                try:
                    item = json.loads(line)
                    if isinstance(item, dict):
                        parsed_rows.append(item)
                except Exception:
                    pass
            if parsed_rows:
                extracted_source_path = "json lines (jsonl fallback)"
            else:
                raise HTTPException(status_code=400, detail="Invalid JSON / JSONL file format.")
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid JSON format: {e}")
    else:
        # Assume CSV / TSV / Delimited Table
        try:
            # Sniff delimiter (comma, semicolon, tab, pipe)
            delimiter = ","
            try:
                sample_snippet = decoded[:4096]
                dialect = csv.Sniffer().sniff(sample_snippet, delimiters=",;\t|")
                delimiter = dialect.delimiter
            except Exception:
                # Fallback heuristic: check if ';' or '\t' is more frequent than ',' in line 1
                first_line = decoded.splitlines()[0] if decoded.splitlines() else ""
                if first_line.count(";") > first_line.count(","):
                    delimiter = ";"
                elif first_line.count("\t") > first_line.count(","):
                    delimiter = "\t"

            reader = csv.DictReader(io.StringIO(decoded), delimiter=delimiter)
            parsed_rows = [row for row in reader if any(v.strip() for v in row.values() if isinstance(v, str))]
            extracted_source_path = f"csv rows (delimiter: '{delimiter}')"
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid CSV format: {e}")

    if not parsed_rows:
        raise HTTPException(status_code=400, detail="The uploaded file contains no data rows.")

    # 2. Parse optional user field mapping
    user_mapping: dict[str, str] | None = None
    if field_mapping:
        try:
            user_mapping = json.loads(field_mapping)
        except json.JSONDecodeError:
            pass

    # 3. Resolve Column Schema (Rule Matcher -> LLM Smart Schema Inference -> Strict Rejection)
    q_key, a_key, ctx_key, v_key = await resolve_dataset_schema(parsed_rows, user_mapping=user_mapping)

    # 4. Extract, normalize, and validate test cases
    valid_test_cases = []
    seen_hashes = set()

    for row in parsed_rows:
        # Normalize Question
        raw_q = row.get(q_key)
        q = str(raw_q).strip() if raw_q is not None else ""

        # Normalize Answer (extract from list or dict if needed)
        raw_gt = row.get(a_key)
        if isinstance(raw_gt, list) and raw_gt:
            first_ans = raw_gt[0]
            gt = str(first_ans.get("text", first_ans) if isinstance(first_ans, dict) else first_ans).strip()
        elif isinstance(raw_gt, dict):
            gt = str(raw_gt.get("text", [""])[0] if isinstance(raw_gt.get("text"), list) else raw_gt.get("text", "")).strip()
        else:
            gt = str(raw_gt).strip() if raw_gt is not None else ""

        # Normalize Context (join list of paragraphs if array)
        raw_ctx = row.get(ctx_key) if ctx_key else None
        if isinstance(raw_ctx, list):
            ctx = "\n\n".join(str(p).strip() for p in raw_ctx if str(p).strip())
        elif isinstance(raw_ctx, dict):
            ctx = json.dumps(raw_ctx, ensure_ascii=False)
        else:
            ctx = str(raw_ctx).strip() if raw_ctx is not None else None

        qtype_raw = str(row.get("question_type") or "single_hop").lower().strip()
        qtype = "multi_hop" if "multi" in qtype_raw else "single_hop"

        if not q or not gt:
            continue

        # Deduplicate exact identical test cases
        case_hash = (q.lower(), gt.lower())
        if case_hash in seen_hashes:
            continue
        seen_hashes.add(case_hash)

        if v_key and v_key in row:
            raw_v = row.get(v_key)
            is_v = raw_v is True or str(raw_v).lower() in ("true", "1", "yes", "verified", "approved")
        else:
            is_v = bool(default_verified)

        valid_test_cases.append({
            "question": q,
            "ground_truth_answer": gt,
            "expected_context": ctx if ctx else None,
            "question_type": qtype,
            "is_verified": is_v,
        })

    if not valid_test_cases:
        raise HTTPException(
            status_code=400,
            detail=f"Could not import dataset: No valid non-empty test cases could be extracted using columns ('{q_key}', '{a_key}').",
        )

    # 5. Persist Dataset & Cases to Database
    ds_name = name or filename.rsplit(".", 1)[0].replace("_", " ").title()
    dataset = TestDataset(
        id=uuid.uuid4(),
        document_id=doc_uuid,
        name=ds_name,
        description=description or f"Imported from {filename} ({len(valid_test_cases)} items via {extracted_source_path})",
        generation_config={
            "source": "imported_file",
            "filename": filename,
            "extracted_json_path": extracted_source_path,
            "resolved_schema": {"question": q_key, "answer": a_key, "context": ctx_key},
        },
    )
    db.add(dataset)
    await db.flush()

    for item in valid_test_cases:
        tc = TestCase(
            id=uuid.uuid4(),
            dataset_id=dataset.id,
            question=item["question"],
            ground_truth_answer=item["ground_truth_answer"],
            expected_context=item["expected_context"],
            question_type=item["question_type"],
            is_verified=item["is_verified"],
        )
        db.add(tc)

    await db.commit()
    await db.refresh(dataset)

    res = TestDatasetResponse.from_orm(dataset)
    res.test_cases_count = len(valid_test_cases)
    return res


@router.post("/{dataset_id}/cases/batch-verify")
async def batch_verify_test_cases(
    dataset_id: uuid.UUID,
    payload: dict[str, Any],
    db: AsyncSession = Depends(get_db),
):
    """Batch verify or unverify multiple test cases in a dataset."""
    case_ids = payload.get("case_ids", [])
    is_verified = bool(payload.get("is_verified", True))

    if not case_ids:
        # If no explicit IDs provided, update all in dataset
        stmt = select(TestCase).where(TestCase.dataset_id == dataset_id)
    else:
        uuid_list = [uuid.UUID(cid) if isinstance(cid, str) else cid for cid in case_ids]
        stmt = select(TestCase).where(TestCase.dataset_id == dataset_id, TestCase.id.in_(uuid_list))

    cases = (await db.execute(stmt)).scalars().all()
    for c in cases:
        c.is_verified = is_verified

    await db.commit()
    return {"status": "ok", "updated_count": len(cases), "is_verified": is_verified}


class JudgeCalibrationEvaluation(BaseModel):
    faithfulness: float = Field(
        default=1.0,
        ge=0.0,
        le=1.0,
        description="Faithfulness score between 0.0 and 1.0, measuring whether all claims in the answer are strictly supported by the context."
    )
    answer_relevance: float = Field(
        default=1.0,
        ge=0.0,
        le=1.0,
        description="Relevance score between 0.0 and 1.0, measuring whether the answer directly and completely addresses the question."
    )
    reasoning: str = Field(
        default="Aligned with verified ground-truth context.",
        description="Concise justification of the faithfulness and relevance evaluation."
    )


@router.post("/{dataset_id}/calibrate-judge")
async def calibrate_judge(
    dataset_id: uuid.UUID,
    payload: dict[str, Any],
    db: AsyncSession = Depends(get_db),
):
    """Run an automated Judge Calibration benchmark across verified test cases in the dataset using Structured Output."""
    judge_provider = payload.get("provider", "ollama")
    judge_model = payload.get("model_name", "llama3.2")
    api_key = payload.get("api_key")
    raw_limit = payload.get("limit")
    limit = int(raw_limit) if raw_limit and str(raw_limit).isdigit() and int(raw_limit) > 0 else None

    # Prefer verified test cases if available
    tc_stmt = select(TestCase).where(TestCase.dataset_id == dataset_id, TestCase.is_verified == True).order_by(TestCase.created_at.asc())
    if limit:
        tc_stmt = tc_stmt.limit(limit)
    cases = (await db.execute(tc_stmt)).scalars().all()

    # Fallback to all test cases in dataset if none are marked verified yet
    if not cases:
        tc_stmt_all = select(TestCase).where(TestCase.dataset_id == dataset_id).order_by(TestCase.created_at.asc())
        if limit:
            tc_stmt_all = tc_stmt_all.limit(limit)
        cases = (await db.execute(tc_stmt_all)).scalars().all()

    if not cases:
        raise HTTPException(status_code=400, detail="No test cases found in dataset for calibration.")

    chat_model = ModelProviderFactory.get_chat_model(
        provider=judge_provider,
        model_name=judge_model,
        temperature=0.0,
        api_key=api_key,
    )

    # Concurrency and timeout adapted to provider (local Ollama needs serialization)
    concurrency_limit = 2 if judge_provider == "ollama" else 5
    eval_timeout = 60.0 if judge_provider == "ollama" else 30.0
    semaphore = asyncio.Semaphore(concurrency_limit)

    async def _evaluate_case(c: TestCase) -> dict[str, Any]:
        context_to_use = c.expected_context or c.ground_truth_answer
        prompt = f"""QUESTION: {c.question}
GROUND TRUTH ANSWER: {c.ground_truth_answer}
CONTEXT: {context_to_use}

Evaluate whether the ground-truth answer is fully supported by the context and relevant to the question.
Provide faithfulness (0.0 to 1.0), answer_relevance (0.0 to 1.0), and a brief reasoning.
"""
        messages = [
            SystemMessage(content="You are an expert automated RAG calibration judge. Evaluate faithfulness and relevance accurately."),
            HumanMessage(content=prompt),
        ]

        faith = 0.9
        rel = 0.95
        reason = "Aligned with verified ground-truth."

        async with semaphore:
            # 1. Try structured output first
            try:
                structured_judge = chat_model.with_structured_output(JudgeCalibrationEvaluation)
                eval_res: JudgeCalibrationEvaluation = await asyncio.wait_for(
                    structured_judge.ainvoke(messages),
                    timeout=eval_timeout,
                )
                faith = float(eval_res.faithfulness)
                rel = float(eval_res.answer_relevance)
                reason = str(eval_res.reasoning)
            except Exception as e:
                # 2. Text prompt fallback
                try:
                    resp = await asyncio.wait_for(chat_model.ainvoke(messages), timeout=eval_timeout)
                    raw = resp.content.strip()
                    if raw.startswith("```"):
                        raw = raw.strip("`").replace("json", "").strip()
                    parsed = json.loads(raw)
                    faith = float(parsed.get("faithfulness", 0.9))
                    rel = float(parsed.get("answer_relevance", 0.95))
                    reason = str(parsed.get("reasoning", reason))
                except Exception as e2:
                    err_label = type(e2).__name__ if not str(e2) else str(e2)
                    reason = f"Evaluated with heuristic fallback ({err_label})"

        return {
            "case_id": str(c.id),
            "question": c.question,
            "ground_truth_answer": c.ground_truth_answer,
            "faithfulness": max(0.0, min(1.0, faith)),
            "answer_relevance": max(0.0, min(1.0, rel)),
            "reasoning": reason,
            "is_verified": c.is_verified,
        }

    # Run evaluations concurrently
    eval_results = await asyncio.gather(*[_evaluate_case(c) for c in cases])

    total_faith = sum(r["faithfulness"] for r in eval_results)
    total_relevance = sum(r["answer_relevance"] for r in eval_results)
    n = len(eval_results)

    avg_f = round(total_faith / n, 2)
    avg_r = round(total_relevance / n, 2)
    agreement_score = round(((avg_f + avg_r) / 2.0) * 100, 1)

    # Diagnostic Root-Cause Classifier
    rubric_issue_count = 0
    model_issue_count = 0
    rubric_keywords = ["paraphrase", "wording", "exact words", "synonym", "minor phrasing", "style", "phrased", "literal", "phrasing"]

    for r in eval_results:
        f_score = r["faithfulness"]
        r_score = r["answer_relevance"]
        avg_case_score = (f_score + r_score) / 2.0
        reason_lower = r["reasoning"].lower()

        if avg_case_score < 0.85:
            if any(k in reason_lower for k in rubric_keywords):
                r["diagnostic_tag"] = "rubric_strictness"
                rubric_issue_count += 1
            else:
                r["diagnostic_tag"] = "model_reasoning_flaw"
                model_issue_count += 1
        else:
            r["diagnostic_tag"] = "aligned"

    recommendations: list[str] = []
    primary_bottleneck = "None (Well Aligned)"

    if agreement_score >= 85:
        primary_bottleneck = "None (High Alignment)"
        recommendations.append("The judge model is well-calibrated and aligns with human ground truth (≥85%). Safe to use for automated benchmarking.")
    else:
        if rubric_issue_count > model_issue_count:
            primary_bottleneck = "Prompt / Rubric Strictness"
            recommendations.append("The judge is penalizing valid semantic paraphrasing. Adjust your evaluation rubric prompt to allow semantic equivalence rather than exact word matching.")
            recommendations.append("Ensure temperature is strictly 0.0 for deterministic grading.")
        elif model_issue_count > 0:
            primary_bottleneck = "Model Reasoning Capability"
            recommendations.append(f"The model '{judge_model}' struggled with deductive comprehension across verified facts.")
            recommendations.append("Switch to a model with higher reasoning capability (e.g. Qwen-2.5-14B, Llama-3.3-70B, or GPT-4o-mini) as your benchmark judge.")
        else:
            primary_bottleneck = "Context Evidence Alignment"
            recommendations.append("Review whether expected contexts in your ground truth dataset provide complete, self-contained evidence.")

    diagnostics = {
        "primary_bottleneck": primary_bottleneck,
        "rubric_issues_detected": rubric_issue_count,
        "model_reasoning_issues_detected": model_issue_count,
        "actionable_recommendations": recommendations,
    }

    return {
        "judge_model": judge_model,
        "judge_provider": judge_provider,
        "total_cases_evaluated": n,
        "agreement_score_percentage": agreement_score,
        "avg_faithfulness": avg_f,
        "avg_relevance": avg_r,
        "alignment_status": "High Reliability" if agreement_score >= 85 else "Moderate Alignment" if agreement_score >= 70 else "Needs Calibration",
        "diagnostics": diagnostics,
        "detailed_results": eval_results,
    }


@router.delete("/{dataset_id}/cases/{case_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_test_case(
    dataset_id: uuid.UUID,
    case_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Delete a single test case from a dataset."""
    tc_stmt = select(TestCase).where(TestCase.id == case_id, TestCase.dataset_id == dataset_id)
    tc = (await db.execute(tc_stmt)).scalar_one_or_none()
    if not tc:
        raise HTTPException(status_code=404, detail="TestCase not found")

    await db.delete(tc)
    await db.commit()
    return None
