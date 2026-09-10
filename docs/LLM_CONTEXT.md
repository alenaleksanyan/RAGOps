# 🧠 RAGOps: Master Context Document for AI Models & Developers

> **How to use this document**: Copy and paste the entire contents of this file into any LLM (ChatGPT, Claude 3.5, Gemini 1.5 Pro, DeepSeek, etc.) at the start of a prompt or session. It gives the AI an instantaneous, 360-degree understanding of the codebase architecture, design patterns, data schemas, mathematical metrics, and implemented features.

---

## 1. Executive Summary & Project Profile

**RAGOps** is an open-source, full-stack LLMOps and RAG evaluation platform designed to eliminate guesswork from Retrieval-Augmented Generation engineering. It allows developers to:
1. Ingest multi-format domain documents (PDF, DOCX, TXT, MD) and evaluate 4 distinct chunking strategies side-by-side.
2. Execute asynchronous combinatorial evaluation matrixes ($C \times E \times K \times D \times R \times L$) on a distributed LangGraph + Redis ARQ worker pipeline.
3. Import custom JSON/CSV datasets and curate human gold standards using an in-page labeling studio.
4. Meta-evaluate and calibrate automated LLM evaluator models (LLM-as-a-Judge) against human-verified gold standards.
5. Converse in real-time with an Agentic RAG assistant that decomposes multi-hop queries, iteratively executes `retrieve_documents(query)` tools, and streams token-by-token citations, atomic claim verification, latency waterfalls, and 2D vector space projections.

---

## 2. Technology Stack & Directory Structure

### Backend (Python 3.11+)
- **Framework**: FastAPI (Async REST + SSE streaming endpoints).
- **ORM & Database**: SQLAlchemy 2.0 (Async) + PostgreSQL 16 with `pgvector` extension.
- **Task Orchestration**: LangGraph StateGraph (RAG Triad evaluation graph) + Redis 7 with ARQ worker queue.
- **AI / Embeddings**: LangChain, FastEmbed (local ONNX embeddings), Ollama (local LLMs & embeddings), OpenAI, Anthropic Claude, Google Gemini, Groq, Cohere.
- **Reranking**: `sentence-transformers` Cross-Encoders (`BAAI/bge-reranker-large`, `ms-marco-MiniLM-L-6-v2`).

### Frontend (TypeScript / Node 18+)
- **Framework**: Next.js 14.2 (App Router, Server & Client Components).
- **Styling**: Tailwind CSS with custom glassmorphism dark mode aesthetic.
- **State Management**: TanStack React Query (server state cache) + Zustand (client API keys & matrix drafts).
- **Data Visualization**: Recharts, Lucide Icons, Framer Motion animations.

### Directory Layout
```
RAGOps/
├── backend/
│   ├── app/
│   │   ├── api/v1/             # REST Endpoints (documents, datasets, matrix, chat, providers)
│   │   ├── core/               # App config, async database sessions, logging
│   │   ├── models/             # SQLAlchemy ORM models (Document, Chunk, Dataset, TestCase, Run)
│   │   ├── schemas/            # Pydantic v2 schemas and validation models
│   │   ├── services/
│   │   │   ├── chunking/       # Recursive, Semantic, Parent-Document, Token splitters
│   │   │   ├── evaluation/     # LangGraph evaluation graph & ConversationalRAGAgent
│   │   │   ├── generator/      # Synthetic QA dataset generator
│   │   │   ├── models/         # Model management & tag deduplication
│   │   │   ├── providers/      # Multi-provider LLM & Embedding factory
│   │   │   └── retrieval/      # Vector store & Hybrid RRF retrieval engine
│   │   └── workers/            # ARQ async background worker tasks
│   └── tests/                  # Pytest unit & integration tests
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
├── docs/                       # Dedicated deep-dive architectural documents
└── docker-compose.yml          # Container orchestration (Web, API, DB, Redis, Worker)
```

---

## 3. Detailed Architectural Modules

### Module 1: Document Ingestion & Chunking Suite (`/documents`)
- Ingests PDF, DOCX, Markdown, and TXT files.
- Generates 4 chunking strategies simultaneously:
  1. **Recursive Character**: Standard paragraph/sentence hierarchical splitting with configurable chunk size & overlap.
  2. **Semantic Splitter**: Calculates embedding cosine distance between adjacent sentences and splits on statistical distance drops.
  3. **Parent-Document Hierarchy**: Indexes fine-grained child chunks (e.g. 200 chars) for high-precision search, but passes the containing parent passage (e.g. 1200 chars) to the LLM.
  4. **Token Windowing**: Token-exact sliding window chunking using `tiktoken`.

### Module 2: Ground-Truth Benchmark & Human Labeling Studio (`/benchmarks`)
- **Custom Import**: Ingests `.json` or `.csv` files with flexible column naming (`question`, `ground_truth_answer`/`answer`, `expected_context`/`context`, `question_type`).
- **Synthetic QA Generator**: Uses an LLM to generate domain question-answer pairs and reference citations from document chunks.
- **Human-in-the-Loop Curation Workbench**:
  - Filter pills: `All`, `Needs Review`, `Verified`.
  - Inline card editors with full-width textareas (`question`, `ground_truth_answer`, `expected_context`).
  - 1-click batch verification and individual verified badges.
  - Verification progress bar (`X / Y Verified (Z%)`).

### Module 3: LLM-as-a-Judge Calibration Studio
- Benchmarks candidate evaluator models against human-verified gold standards.
- Evaluates:
  - **Agreement Score (%)**: Mathematical alignment between human-verified answers and automated judge scoring.
  - **Average Faithfulness** & **Average Relevance**.
  - **Judge Reliability Classification**: Categorized into *High Reliability*, *Moderate Agreement*, or *Needs Review*.
  - **Per-Question Justifications**: Detailed reasoning logs explaining why the judge assigned specific scores.

### Module 4: Unified Experimentation Matrix & Pareto Frontier Hub (`/matrix`)
- Generates a combinatorial execution grid:
  $$\text{Strategies} \times \text{Embedding Models} \times k\text{-NN Values} \times \text{Distance Metrics} \times \text{Rerankers} \times \text{LLM Models}$$
- Arbitrary $k$ selection (integer input + preset tags $k=1,3,5,8,10,15,20$).
- Pre-flight validation ensuring local Ollama models are pulled before launching runs.
- **Active Sweep Progress Banner**: Real-time progress bar tracking execution percentage, completed runs count, and current status during active sweeps.
- **2D Pareto Frontier Heatmap**: Visualizes quality vs. latency/cost trade-offs across all completed configurations, identifies non-dominated Pareto-optimal pipelines, and allows 1-click drilldown into detailed run telemetry.

### Module 5: Interactive RAG Agent Playground (`/playground`)
- **3 Execution Modes**:
  1. **Agentic Mode**: Autonomous query routing (technical vs greeting), query rewriting, multi-hop sub-query decomposition, and iterative `retrieve_documents(query)` tool execution with real-time UI step cards.
  2. **Hybrid Mode**: Dense Vector search + Sparse BM25 keyword matching fused via Reciprocal Rank Fusion (RRF).
  3. **Direct Mode**: Single-stage vector similarity search with bracketed citations (`[1]`, `[2]`).
- **Live Diagnostics Sidebar**:
  - Retrieved Chunks inspector with score and rank.
  - Quality Index (Faithfulness, Precision, Relevance, Noise Ratio, Utilization Rate).
  - Atomic Claim decomposition (`[SUPPORTED]` vs `[UNSUPPORTED]`).
  - Latency Waterfall Gantt chart (Embedding, Vector Search, Reranking, TTFT, Total).
  - 2D Vector Space PCA coordinate projection.

### Module 6: Comparative Analytics, Multi-Pipeline Radar & Failure Analysis (`/analytics` & `/compare`)
- **Multi-Pipeline Radar Comparison**: Select up to 4 configurations simultaneously and evaluate their performance footprint on an interactive 6-axis Radar chart (Precision, Recall, Faithfulness, Relevance, Latency, Cost).
- **Configuration Leaderboard**: Sort and rank all matrix configurations by composite score, faithfulness, recall, precision, latency, and cost.
- **Metric Delta Highlighting**: Color-coded green/red percentage deltas against baseline configurations to instantly identify regressions or gains.
- **Side-by-Side Run Diff Viewer**: Inspect parameter differences, retrieved contexts, and generated responses.
- **Diagnostic Autopsy**: Root-cause failure analysis automatically identifying hallucinations, context starvation, and noise distractors.

---

## 4. Evaluation Metrics Formulation

1. **Context Precision@k**:
   $$\text{Precision@k} = \frac{\sum_{i=1}^k \text{Precision@i} \times \text{IsRelevant}(i)}{\text{Total Relevant Chunks in Top } k}$$

2. **Context Recall**:
   $$\text{Recall} = \frac{|\text{Ground-Truth Sentences Supported by Context}|}{|\text{Total Sentences in Ground Truth}|}$$

3. **Faithfulness (Hallucination Index)**:
   $$\text{Faithfulness} = \frac{|\text{Generated Claims Verified by Context}|}{|\text{Total Generated Claims}|}$$

4. **Answer Relevance**:
   $$\text{Answer Relevance} = \frac{\mathbf{e}_q \cdot \mathbf{e}_a}{\|\mathbf{e}_q\| \|\mathbf{e}_a\|}$$

5. **Reciprocal Rank Fusion (RRF)**:
   $$\text{RRF}(d) = \sum_{m \in \{\text{Dense}, \text{BM25}\}} \frac{1}{60 + \text{rank}_m(d)}$$
