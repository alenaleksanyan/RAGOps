# 🏛 System Architecture & Data Flow

This document details the internal architecture, database schema, background worker pipeline, and streaming protocol of **RAGOps**.

---

## 1. System Components

```
┌─────────────────────────────────────────────────────────────┐
│                      Next.js 14 Frontend                    │
│  - React 18, TanStack Query, Zustand, Tailwind CSS, Recharts│
│  - Live SSE Parser, Markdown Renderer, Inline Labeling Studio│
└──────────────────────────────┬──────────────────────────────┘
                               │ HTTP / SSE Token Stream
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                     FastAPI Gateway API                     │
│  - Document Ingestion & Chunking Router                     │
│  - Benchmarks & Judge Calibration Router                    │
│  - Matrix Experimentation Orchestration                     │
│  - Conversational Agent SSE Streaming Engine                │
└──────────────┬───────────────────────────────┬──────────────┘
               │                               │
               ▼                               ▼
┌──────────────────────────────┐┌──────────────────────────────┐
│  PostgreSQL 16 + pgvector    ││       Redis 7 + ARQ Worker   │
│  - Documents & Chunks Table  ││  - Async Evaluation Jobs     │
│  - Datasets & TestCases Table││  - LangGraph StateGraph      │
│  - Experiments & Runs Table  ││  - Parallel Triad Evaluator  │
└──────────────────────────────┘└──────────────────────────────┘
```

---

## 2. Database Schema (PostgreSQL + pgvector)

### `documents`
- `id` (UUID, Primary Key)
- `filename` (String)
- `original_filename` (String)
- `file_size` (Integer)
- `mime_type` (String)
- `content_hash` (String)
- `storage_path` (String)
- `status` (Enum: `pending`, `processing`, `indexed`, `failed`)
- `page_count` (Integer)
- `doc_metadata` (JSONB)
- `created_at` (Timestamp)

### `document_chunks`
- `id` (UUID, Primary Key)
- `document_id` (UUID, Foreign Key -> `documents.id`)
- `strategy` (String: `recursive`, `semantic`, `parent_document`, `token_window`)
- `content` (Text)
- `chunk_index` (Integer)
- `token_count` (Integer)
- `char_count` (Integer)
- `embedding` (Vector: `dim=1536` or dynamic embedding dimension)
- `parent_chunk_id` (UUID, Optional Foreign Key -> `document_chunks.id`)
- `chunk_metadata` (JSONB)

### `test_datasets`
- `id` (UUID, Primary Key)
- `document_id` (UUID, Optional Foreign Key -> `documents.id`)
- `name` (String)
- `description` (Text)
- `generation_config` (JSONB)
- `created_at` (Timestamp)

### `test_cases`
- `id` (UUID, Primary Key)
- `dataset_id` (UUID, Foreign Key -> `test_datasets.id`)
- `question` (Text)
- `ground_truth_answer` (Text)
- `expected_context` (Text, Optional reference passage)
- `question_type` (String: `single_hop`, `multi_hop`, `extractive`, `summarization`)
- `is_verified` (Boolean, default `False`)
- `created_at` (Timestamp)

### `experiments`
- `id` (UUID, Primary Key)
- `dataset_id` (UUID, Foreign Key -> `test_datasets.id`)
- `name` (String)
- `description` (Text)
- `matrix_config` (JSONB: Strategies, Models, $k$, Metrics, Rerankers, LLMs)
- `status` (Enum: `queued`, `running`, `completed`, `failed`)
- `total_runs` (Integer)
- `completed_runs` (Integer)
- `created_at` (Timestamp)

### `experiment_runs`
- `id` (UUID, Primary Key)
- `experiment_id` (UUID, Foreign Key -> `experiments.id`)
- `run_config` (JSONB: Single configuration tuple)
- `status` (Enum: `queued`, `running`, `completed`, `failed`)
- `metrics` (JSONB: Precision, Recall, Faithfulness, Relevance, TTFT, Latency, Cost)
- `detailed_results` (JSONB: Per-test-case generated answers, retrieved chunks, and scores)
- `created_at` (Timestamp)

---

## 3. Distributed Evaluation Pipeline (LangGraph + ARQ)

When a matrix experiment is launched:
1. The FastAPI gateway decomposes the matrix configuration into $N$ individual execution tasks (`experiment_runs`).
2. Tasks are enqueued into **Redis** via **ARQ**.
3. Distributed worker processes execute the **LangGraph StateGraph**:
   - **Node 1: Retrieve**: Queries the `document_chunks` table using the configured strategy, embedding model, distance metric, and reranker.
   - **Node 2: Generate**: Formulates the prompt with context passages and streams response from the target LLM.
   - **Node 3: Evaluate Retrieval**: Computes **Context Precision@k** and **Context Recall** against the ground truth.
   - **Node 4: Evaluate Generation**: Computes **Faithfulness** (claim grounding) and **Answer Relevance**.
   - **Node 5: Telemetry**: Calculates exact prompt/completion token costs in USD and microsecond latencies.
4. Results are persisted to the database and real-time progress updates are emitted.
