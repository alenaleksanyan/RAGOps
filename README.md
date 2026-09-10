# 🚀 RAGOps: Enterprise-Grade RAG Evaluation & Experimentation Workbench

[![License: MIT](https://img.shields.io/badge/License-MIT-indigo.svg)](https://opensource.org/licenses/MIT)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.111.0-009688.svg?logo=fastapi)](https://fastapi.tiangolo.com)
[![Next.js](https://img.shields.io/badge/Next.js-14.2-black.svg?logo=next.js)](https://nextjs.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16%2Bpgvector-336791.svg?logo=postgresql)](https://github.com/pgvector/pgvector)
[![LangGraph](https://img.shields.io/badge/LangGraph-StateGraph-orange.svg)](https://langchain-ai.github.io/langgraph/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED.svg?logo=docker)](https://www.docker.com/)

**RAGOps** is a comprehensive, open-source developer platform and LLMOps evaluation workbench built to eliminate guesswork from Retrieval-Augmented Generation (RAG) engineering.

It provides a unified testing ground to ingest domain documents, design multi-dimensional parameter matrixes, curate human gold-standard benchmarks, meta-evaluate automated LLM judges, test iterative multi-step Agentic RAG in real-time, and run deep failure analysis on hallucinations, latency, and costs.

---

## 📚 Deep-Dive Documentation Guides

For in-depth architectural and mathematical references, explore our dedicated docs:

- **[🤖 LLM Context Master Prompt](docs/LLM_CONTEXT.md)** — Instant 360° context document to paste into other AI models.
- **[🏛 System Architecture & Schemas](docs/ARCHITECTURE.md)** — PostgreSQL `pgvector` schemas, LangGraph pipeline, and ARQ workers.
- **[⚡ Multi-Step Agentic RAG](docs/AGENTIC_RAG.md)** — Autonomous ReAct agent, multi-hop planner, and tool execution protocol.
- **[📊 Benchmark Curation & Judge Calibration](docs/BENCHMARK_AND_CALIBRATION.md)** — Synthetic QA, human labeling studio, and agreement scoring.
- **[📐 Evaluation Metrics & Formulas](docs/EVALUATION_METRICS.md)** — Mathematical definitions for Context Precision, Recall, Faithfulness, Relevance, and RRF.

---

## 🌟 Key Capabilities & Highlights

- **Multi-Format Ingestion & Multi-Strategy Chunking**: Upload PDF, DOCX, Markdown, and TXT files. Preview and compare chunk boundaries across **Recursive Character**, **Semantic Splitter**, **Parent-Document (Hierarchical)**, and **Token Windowing**.
- **Combinatorial Matrix Engine**: Run multi-dimensional experiments across:
  $$\text{Chunking Strategies} \times \text{Embedding Models} \times k\text{-NN Values} \times \text{Distance Metrics} \times \text{Rerankers} \times \text{LLM Generators}$$
- **Human-in-the-Loop Labeling Studio**: In-page workbench to import custom `.json` or `.csv` datasets, edit prompts and answers inline, track verification progress (`X / Y Verified`), and batch-verify gold standards.
- **LLM-as-a-Judge Meta-Evaluation**: Calibrate automated judge models (e.g. `llama3.2`, `gpt-4o-mini`, `claude-3-5-sonnet`) against human-verified gold standards, generating Agreement Scores (%), Average Faithfulness, Average Relevance, and per-question reasoning logs.
- **Multi-Mode RAG Agent with Iterative Tool Invocations**:
  - 🤖 **Agentic RAG**: Autonomous query router, query rewriter, multi-hop sub-query decomposition, and iterative `retrieve_documents` tool execution with real-time UI step visualization.
  - 🔀 **Hybrid RAG**: Dense vector neural search + Sparse BM25 keyword matching fused via **Reciprocal Rank Fusion (RRF)**.
  - 🎯 **Standard Direct RAG**: High-precision vector retrieval with bracketed inline citation anchors (`[1]`, `[2]`).
- **Live SSE Diagnostics & Telemetry**: Real-time token streaming, Time-to-First-Token (TTFT), total latency waterfalls, token cost tracking in USD, atomic claim extraction with verification badges, and 2D vector space PCA projection.
- **Local-First & Cloud-Agnostic**: Run entirely offline with **Ollama** and **FastEmbed**, or seamlessly plug in API keys for **OpenAI**, **Anthropic Claude**, **Google Gemini**, **Groq**, and **Cohere**.

---

## 🏛 System Architecture

```
                                  ┌───────────────────────────────────────────────────┐
                                  │            Next.js 14 Web Frontend                │
                                  │      (Playground, Matrix, Studio, Analytics)       │
                                  └─────────────────────────┬─────────────────────────┘
                                                            │ HTTP / SSE Token Stream
                                                            ▼
                                  ┌───────────────────────────────────────────────────┐
                                  │             FastAPI Backend Gateway               │
                                  │      (REST Endpoints, Streaming SSE, Router)      │
                                  └─────────────────────────┬─────────────────────────┘
                                                            │
                            ┌───────────────────────────────┼───────────────────────────────┐
                            ▼                               ▼                               ▼
       ┌──────────────────────────────┐┌──────────────────────────────┐┌──────────────────────────────┐
       │   Ingestion & Chunking Hub   ││  Benchmark & Labeling Studio ││    Conversational Engine     │
       │   - Recursive Character      ││  - JSON / CSV Dataset Import ││  - Direct RAG                │
       │   - Semantic Embedding Split ││  - Synthetic QA Generator    ││  - Hybrid (Dense + BM25 RRF) │
       │   - Parent-Child Hierarchy   ││  - Human Curation Workbench  ││  - Multi-Hop Agentic Tool    │
       │   - Token Sliding Window     ││  - Judge Calibration Studio  ││  - Live SSE Telemetry        │
       └──────────────┬───────────────┘└──────────────┬───────────────┘└──────────────┬───────────────┘
                      │                               │                               │
                      └───────────────────────────────┼───────────────────────────────┘
                                                      │ Redis Queue
                                                      ▼
                                  ┌───────────────────────────────────────────────────┐
                                  │           ARQ Async Distributed Worker            │
                                  │    (LangGraph StateGraph, RAG Triad Evaluators)   │
                                  └─────────────────────────┬─────────────────────────┘
                                                            │
                                                            ▼
                                  ┌───────────────────────────────────────────────────┐
                                  │            PostgreSQL 16 + pgvector               │
                                  │   (Documents, Chunks, Embeddings, Runs, Telemetry)│
                                  └───────────────────────────────────────────────────┘
```

---

## 🧩 Core Modules & Features

### 1. Document Ingestion & Chunking Suite (`/documents`)

Upload domain knowledge bases and inspect how different chunking algorithms partition your documents:

| Strategy | Mechanism | Best Used For |
| :--- | :--- | :--- |
| **Recursive Character** | Hierarchical separators (`\n\n`, `\n`, ` `, `""`) preserving paragraph structure with configurable overlap. | General prose, technical documentation, manuals. |
| **Semantic Splitter** | Computes cosine distance between adjacent sentence embeddings; splits when semantic divergence exceeds a percentile threshold. | Research papers, narrative essays, multi-topic articles. |
| **Parent-Document (Hierarchical)** | Indexes small child chunks (e.g. 200 chars) for high-precision vector search, while returning the surrounding parent block (e.g. 1000 chars) for LLM context generation. | Eliminating context starvation while maintaining sharp search precision. |
| **Token Windowing** | Fixed token boundaries using `tiktoken` with sliding overlap. | LLMs with strict token budget constraints. |

---

### 2. Ground-Truth Benchmark & Human Labeling Studio (`/benchmarks`)

Evaluate your RAG pipeline against curated, gold-standard test datasets:

- **Custom Dataset Import**: Drag and drop `.json` or `.csv` files. Automatically parses column mappings (`question`, `ground_truth_answer` / `answer`, `expected_context`, `question_type`).
- **Synthetic QA Pair Generation**: Automatically extracts single-hop and multi-hop reasoning question-answer pairs directly from ingested document chunks using local or cloud LLMs.
- **Human-in-the-Loop Curation Workbench**:
  - Filter by **`All`**, **`Needs Review`**, or **`Verified`**.
  - **Inline Card Editors**: Edit questions, ground-truth answers, and reference context passages directly in the page without modal popups.
  - **Verification Badges & Progress Bar**: 1-click **Verify All** and per-card verification toggles with visual progress tracking (`X / Y Verified (Z%)`).
  - **Export Dataset**: Download curated datasets as clean JSON files anytime.

---

### 3. LLM-as-a-Judge Calibration Studio

Before trusting an automated LLM to score your RAG pipeline, calibrate the judge against your human gold-standard dataset:

- Select any candidate evaluator model (e.g. `llama3.2`, `mistral:7b`, `gpt-4o-mini`, `claude-3-5-sonnet`).
- Choose sample size (`All Verified Questions`, `10 Questions`, `20 Questions`).
- Computes:
  - **Agreement Score (%)**: Mathematical correlation between human ground truth and judge evaluations.
  - **Average Faithfulness**: Accuracy of the judge in identifying claim grounding.
  - **Judge Status**: Categorized as *High Reliability*, *Moderate Agreement*, or *Needs Review*.
  - **Per-Question Justifications**: Full reasoning logs detailing why the judge scored each question up or down.

---

### 4. Unified Experimentation Matrix & Pareto Frontier Hub (`/matrix`)

Design combinatorial benchmark experiments and visualize optimal trade-offs in a single unified control room:

- **Combinatorial Parameter Matrix**:
  - Select multiple **Chunking Strategies** (Recursive, Semantic, Parent-Document, Token Window).
  - Select multiple **Embedding Models** (`bge-small-en-v1.5`, `bge-large-en-v1.5`, `text-embedding-3-small`, `all-MiniLM-L6-v2`).
  - Configure arbitrary **Retrieval $k$-NN values** using custom integer inputs and preset chips ($k = 1, 3, 5, 8, 10, 15, 20$).
  - Select **Distance Metrics** (Cosine Distance, Euclidean $L_2$, Inner Product).
  - Add **Cross-Encoder Rerankers** (`bge-reranker-large`, `ms-marco-MiniLM-L-6-v2`, or No Reranker baseline).
  - Choose **Generator LLMs** (`llama3.2`, `llama3.1:8b`, `gpt-4o-mini`, `claude-3-5-sonnet`, `gemini-1.5-flash`).
- **Pre-Flight Model Readiness Guard**: Automatically checks and flags un-pulled local Ollama models before dispatching runs.
- **Active Sweep Progress Banner**: Real-time progress bar tracking execution percentage, completed runs count, and current status during active sweeps.
- **2D Pareto Frontier Heatmap**:
  - Visualizes quality vs. latency/cost trade-offs across all completed configurations.
  - Automatically identifies non-dominated Pareto-optimal pipelines.
  - 1-click drilldown from any heatmap node into comprehensive run telemetry and chunk inspection.

---

### 5. Interactive RAG Agent Playground (`/playground`)

Test, debug, and converse with your RAG pipeline in real-time with live SSE token streaming:

#### 3 Distinct RAG Execution Modes:
1. 🤖 **Agentic RAG**:
   - **Autonomous Router**: Distinguishes between technical domain questions and conversational small-talk.
   - **Query Rewriter**: Resolves conversational pronouns and conversational context into standalone search queries.
   - **Multi-Hop Query Planner**: Decomposes complex queries into focused sub-queries.
   - **Iterative Tool Execution**: Invokes `retrieve_documents(query)` multiple times as needed and aggregates evidence.
   - **Visualized Tool Steps**: Displays step-by-step tool invocation cards in the UI with search terms, latencies, and retrieved chunk snippets.
2. 🔀 **Hybrid RAG**: Dense semantic vector retrieval + Sparse BM25 keyword matching fused via Reciprocal Rank Fusion (RRF).
3. 🎯 **Standard Direct RAG**: Single-stage vector similarity search with bracketed citation links (`[1]`, `[2]`).

#### Real-Time Diagnostics Panel:
- **Retrieved Chunks**: Full text, similarity score, rank, and parent hierarchy mapping.
- **Quality Index**: Live Faithfulness, Context Precision, Answer Relevance, Context Noise Ratio, and Utilization Rate.
- **Atomic Claims Verification**: Decomposes the generated response into atomic assertions and verifies each against context (`[SUPPORTED]` vs `[UNSUPPORTED]`).
- **Latency Waterfall**: Microsecond-accurate breakdown of Embedding Time, Vector Search Time, Reranking Time, Time-to-First-Token (TTFT), and Total Generation Time.
- **2D Vector Space Projection**: Interactive PCA coordinate map plotting query and retrieved chunk proximity.

---

### 6. Comparative Analytics, Leaderboard & Multi-Pipeline Comparison (`/analytics` & `/compare`)

- **Multi-Pipeline Radar Comparison**: Select up to 4 configurations simultaneously and evaluate their performance footprint on an interactive 6-axis Radar chart (Precision, Recall, Faithfulness, Relevance, Latency, Cost).
- **Configuration Leaderboard**: Sort and rank all matrix configurations by Composite Score, Faithfulness, Context Recall, Context Precision, Latency, and Cost.
- **Metric Delta Highlighting**: Color-coded green/red percentage deltas against baseline configurations to instantly identify regressions or gains.
- **Diagnostic Autopsy**:
  - Automatically identifies **Hallucinations** (high context recall, low faithfulness).
  - Automatically identifies **Context Starvation / Retrieval Misses** (low context recall, low answer relevance).
  - Automatically identifies **Noise Distractors** (high context noise ratio, degraded generator precision).

---

### 7. Local & Cloud Model Manager (`/settings`)

- **Local Model Library**: 1-click download manager for local Ollama models (`llama3.2`, `llama3.1:8b`, `mistral:7b`, `qwen2.5:7b`, `bge-m3`) with live streaming download progress bars.
- **BYOK (Bring Your Own Keys)**: Configure API keys for OpenAI, Anthropic, Google Gemini, Groq, and Cohere. Keys are stored locally in your browser session and never persisted to public databases.

---

## 📐 RAG Triad & Evaluation Metrics Explained
 
RAGOps evaluates systems across the foundational **RAG Triad**:

```
                       ┌─────────────────────────────────────┐
                       │               Question              │
                       └──────────┬───────────────┬──────────┘
                                  │               │
                 Context Precision│               │Answer Relevance
                  (Retrieval Step)│               │(Generation Step)
                                  ▼               ▼
                       ┌──────────────┐       ┌──────────────┐
                       │   Context    │──────>│    Answer    │
                       └──────────────┘       └──────────────┘
                                         ▲
                                         │ Faithfulness
                                         │ (Anti-Hallucination)
```

### 1. Context Precision
Measures whether the relevant chunks are ranked at the top of the context window:
$$\text{Context Precision@k} = \frac{\sum_{i=1}^k \text{Precision@i} \times \text{IsRelevant}(i)}{\text{Total Relevant Chunks in Top } k}$$

### 2. Context Recall
Measures whether all factual claims in the ground-truth answer are present in the retrieved chunks:
$$\text{Context Recall} = \frac{|\text{Ground-Truth Sentences Supported by Context}|}{|\text{Total Sentences in Ground Truth}|}$$

### 3. Faithfulness (Hallucination Index)
Measures whether every claim in the generated answer can be strictly deduced from the retrieved context:
$$\text{Faithfulness} = \frac{|\text{Claims Verified by Context}|}{|\text{Total Claims Made in Generated Response}|}$$

### 4. Answer Relevance
Measures whether the generated answer directly addresses the user's inquiry without extraneous tangent information:
$$\text{Answer Relevance} = \text{CosineSimilarity}(\mathbf{e}_{\text{question}}, \mathbf{e}_{\text{answer}})$$

### 5. Reciprocal Rank Fusion (RRF) for Hybrid Search
Combines dense vector ranks and sparse BM25 ranks without score normalization:
$$\text{RRF\_Score}(d) = \sum_{m \in \{\text{Dense}, \text{BM25}\}} \frac{1}{60 + \text{rank}_m(d)}$$

---

## ⚡ Quickstart with Docker

The fastest way to run the entire stack (Frontend, Backend, PostgreSQL pgvector, Redis, and ARQ worker):

### 1. Clone & Configure Environment
```bash
git clone https://github.com/alenaleksanyan/RAGOps.git
cd RAGOps
cp .env.example .env
```

### 2. Start Services
```bash
docker compose up --build
```

### 3. Access Services
- 🌐 **Web UI**: [http://localhost:3000](http://localhost:3000)
- 🔌 **FastAPI REST API**: [http://localhost:8000](http://localhost:8000)
- 📖 **Interactive Swagger Docs**: [http://localhost:8000/docs](http://localhost:8000/docs)
- 🐘 **PostgreSQL (pgvector)**: `localhost:5432` (`user: postgres`, `db: ragbench`)
- 🔴 **Redis**: `localhost:6379`

---

## 💻 Local Development Setup

If you prefer to run services natively on your host machine:

### Prerequisites
- **Python 3.11+**
- **Node.js 18+** & **npm**
- **PostgreSQL 16** with the `vector` extension enabled
- **Redis 7+**
- **Ollama** (optional, for local LLMs: `ollama run llama3.2`)

### 1. Database Setup
```sql
CREATE DATABASE ragbench;
\c ragbench;
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

### 2. Backend Setup
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -e ".[dev]"

# Start FastAPI API server
uvicorn app.main:app --reload --port 8000
```

In a separate terminal, start the ARQ background worker:
```bash
cd backend
source venv/bin/activate
python -m arq app.workers.arq_worker.WorkerSettings
```

### 3. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

Visit **[http://localhost:3000](http://localhost:3000)** in your browser.

---

## 📡 API Reference

### Document Management
- `POST /api/v1/documents/upload`: Upload PDF, DOCX, Markdown, or TXT file.
- `GET /api/v1/documents`: List all ingested documents and chunk counts.
- `GET /api/v1/documents/{id}/chunks`: Retrieve chunks with filtering by strategy.
- `DELETE /api/v1/documents/{id}`: Delete document and its vector embeddings.

### Benchmarks & Datasets
- `POST /api/v1/datasets/generate`: Auto-synthesize QA benchmark pairs using an LLM.
- `POST /api/v1/datasets/import`: Import custom JSON / CSV benchmark datasets.
- `GET /api/v1/datasets`: List all benchmark test datasets.
- `GET /api/v1/datasets/{id}/cases`: Retrieve test cases in a dataset.
- `POST /api/v1/datasets/{id}/cases`: Add a custom test case.
- `PUT /api/v1/datasets/{id}/cases/{case_id}`: Update / verify a test case.
- `POST /api/v1/datasets/{id}/cases/batch-verify`: 1-click batch verify test cases.
- `POST /api/v1/datasets/{id}/calibrate-judge`: Meta-evaluate candidate judge models.

### Matrix Experimentation
- `POST /api/v1/matrix/run`: Launch asynchronous combinatorial evaluation matrix.
- `GET /api/v1/matrix/experiments`: List all matrix experiments and run statuses.
- `GET /api/v1/matrix/experiments/{id}`: Get experiment metrics and individual run logs.
- `GET /api/v1/matrix/compare?run_a={id}&run_b={id}`: Side-by-side run comparison.

### Conversational Agent & Playground
- `POST /api/v1/chat/stream`: Stream SSE chat tokens, citations, multi-step tool calls, and live telemetry.
- `GET /api/v1/providers`: List available models, providers, and local download statuses.
- `POST /api/v1/providers/pull`: Trigger streaming download of local Ollama models.

---

## 📂 Project Directory Structure

```
RAGOps/
├── backend/
│   ├── app/
│   │   ├── api/v1/             # REST Endpoints (documents, datasets, matrix, chat, providers)
│   │   ├── core/               # App configuration, database sessions, logging
│   │   ├── models/             # SQLAlchemy ORM models (Document, Chunk, Dataset, Run)
│   │   ├── schemas/            # Pydantic v2 schemas and validation models
│   │   ├── services/
│   │   │   ├── chunking/       # Recursive, Semantic, Parent-Document, Token splitters
│   │   │   ├── evaluation/     # LangGraph evaluation graph & ConversationalRAGAgent
│   │   │   ├── generator/      # Synthetic QA dataset generator
│   │   │   ├── models/         # Model management & tag deduplication
│   │   │   ├── providers/      # Multi-provider LLM & Embedding factory
│   │   │   └── retrieval/      # Vector store & Hybrid RRF retrieval engine
│   │   └── workers/            # ARQ async background worker tasks
│   └── tests/                  # Unit & integration tests
├── docs/                       # Architectural specs, evaluation formulas, and LLM context
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── analytics/      # Analytics, Leaderboard & Failure Analysis
│   │   │   ├── benchmarks/     # In-page Benchmark & Human Labeling Studio
│   │   │   ├── compare/        # Multi-Pipeline Radar & Side-by-side Diff Viewer
│   │   │   ├── documents/      # Document Ingestion & Chunk Preview
│   │   │   ├── experiments/    # Experiment Run History & Details
│   │   │   ├── matrix/         # Unified Combinatorial Matrix & 2D Pareto Heatmap
│   │   │   ├── playground/     # Real-Time RAG Agent Chat Playground
│   │   │   └── settings/       # Model library & API keys configuration
│   │   ├── components/         # Shared UI components (Charts, Modals, Markdown)
│   │   ├── lib/                # API client, Zustand stores, utilities
│   │   └── types/              # TypeScript interfaces and schemas
├── docker-compose.yml          # Multi-container Docker orchestration
└── README.md                   # Project documentation
```

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! Feel free to check the [issues page](https://github.com/your-username/rag-bench/issues).

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📜 License

Distributed under the **MIT License**. See `LICENSE` for more information.
