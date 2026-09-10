# 🤖 Multi-Step Agentic RAG & Tool Execution Protocol

This document explains the autonomous decision-making engine, query planning, iterative tool retrieval loop, and live SSE event protocol powering the **Agentic RAG Playground**.

---

## 1. Agentic Architecture Overview

Traditional RAG executes a single vector retrieval call before generating an answer. In contrast, **RAG-Bench Agentic Mode** operates as an autonomous ReAct loop:

```
                            ┌────────────────────────────────────────┐
                            │            User Input Query            │
                            └───────────────────┬────────────────────┘
                                                │
                                                ▼
                            ┌────────────────────────────────────────┐
                            │       Query Router & Classifier        │
                            │ (Detects Greeting vs Technical Query)  │
                            └───────────────────┬────────────────────┘
                                                │
                     ┌──────────────────────────┴──────────────────────────┐
                     │ Technical Domain Query                              │ Conversational Small Talk
                     ▼                                                     ▼
┌────────────────────────────────────────┐               ┌───────────────────────────────────┐
│     Conversational Query Rewriter      │               │     Direct Conversational Engine  │
│  (Resolves Coreferences & Pronouns)    │               │    (Streams Greeting Instantly)   │
└───────────────────┬────────────────────┘               └───────────────────────────────────┘
                    │
                    ▼
┌────────────────────────────────────────┐
│      Multi-Hop Query Planner           │
│ (Decomposes Comparative/Complex Facets)│
└───────────────────┬────────────────────┘
                    │
                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│               Iterative Multi-Step Tool Retrieval Loop                 │
│                                                                        │
│  Step 1: retrieve_documents(query="aspect_1") ──> Chunks Gathered      │
│  Step 2: retrieve_documents(query="aspect_2") ──> Chunks Gathered      │
│  Step N: (Iterative search until context is complete)                 │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│            Deduplication, Ranking & Citation Numbering                 │
│              [1] Chunk A  •  [2] Chunk B  •  [3] Chunk C               │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     Grounded Response Generation                       │
│    (Streaming SSE Tokens + Claims Verification + Latency Waterfall)    │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Agent Sub-Modules

### 1. Autonomous Query Router
Classifies incoming user messages into domain technical queries vs casual small talk.
- If casual greeting $\rightarrow$ Bypasses vector search, streams a natural conversational response instantly.
- If technical inquiry $\rightarrow$ Initiates domain knowledge retrieval protocol.

### 2. Conversational Query Rewriter
When users engage in multi-turn dialogues (e.g. *"How does it compare to the second option?"*), the rewriter examines previous turns and formulates a standalone, unambiguous search query suitable for semantic vector retrieval.

### 3. Multi-Hop Query Planner (`_plan_multi_hop_queries`)
Detects comparative signals (*"compare"*, *"difference between"*, *"vs"*, *"tradeoffs"*) and decomposes the prompt into multiple focused sub-queries.

### 4. Iterative `retrieve_documents` Tool Execution
Executes vector or hybrid retrieval across each formulated sub-query, recording:
- `step`: Tool call sequence index (1, 2, ...).
- `tool_name`: `"retrieve_documents"`.
- `query`: The specific sub-query searched.
- `latency_ms`: Execution time for this search call.
- `chunks_found`: Number of chunks returned.
- `chunks`: List of retrieved passage snippets, similarity scores, and ranks.

---

## 3. Server-Sent Events (SSE) Streaming Protocol

The `/api/v1/chat/stream` endpoint yields structured SSE events:

| Event Type | Payload | Description |
| :--- | :--- | :--- |
| `event: routing` | `{"rag_mode": "agentic", "routing_decision": "...", "rewritten_query": "..."}` | Emitted when query classification and rewriting completes. |
| `event: tool_call` | `{"step": 1, "query": "...", "latency_ms": 38.2, "chunks_found": 3, "chunks": [...]}` | Emitted in real-time as each iterative retrieval tool call finishes. |
| `event: retrieved` | `{"retrieved_chunks": [...], "citations": [...], "tool_calls": [...]}` | Emitted after all gathered chunks are merged, ranked, and citation-indexed. |
| `event: token` | `{"delta": "..."}` | Real-time LLM generation token stream. |
| `event: telemetry` | `{"telemetry": {...}}` | Final analytical payload (TTFT, total latency, token cost, faithfulness, atomic claims). |
| `event: done` | `{}` | Signals completion of stream. |
