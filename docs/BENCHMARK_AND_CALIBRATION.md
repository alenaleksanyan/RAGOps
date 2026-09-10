# 📊 Benchmark Dataset Curation & LLM-as-a-Judge Calibration

This document details the Ground-Truth Dataset generation pipeline, Human-in-the-Loop curation studio, and LLM-as-a-Judge meta-evaluation methodology.

---

## 1. Ground-Truth Data Curation Workflow

Reliable RAG evaluation requires authoritative, gold-standard test cases:

```
┌──────────────────────────────┐       ┌──────────────────────────────┐
│  Upload Document (.pdf/.md)  │       │   Import Custom JSON / CSV   │
└──────────────┬───────────────┘       └──────────────┬───────────────┘
               │                                      │
               ▼                                      ▼
┌──────────────────────────────┐       ┌──────────────────────────────┐
│ Synthetic QA Pair Generator  │       │ Direct Schema Ingestion      │
│  - Single-Hop & Multi-Hop QA │       │ (Question, Answer, Context)  │
└──────────────┬───────────────┘       └──────────────┬───────────────┘
               │                                      │
               └───────────────────────┬──────────────┘
                                       │
                                       ▼
                     ┌───────────────────────────────────┐
                     │ Human-in-the-Loop Labeling Studio │
                     │  - Inline Card Editors (Full Text)│
                     │  - Filter: All / Needs Review / Ok│
                     │  - 1-Click Verification Badges    │
                     │  - Verified Gold Standard Meter   │
                     └─────────────────┬─────────────────┘
                                       │
                                       ▼
                     ┌───────────────────────────────────┐
                     │   LLM-as-a-Judge Calibration      │
                     │  - Agreement Score (%) vs Human   │
                     │  - Average Faithfulness/Relevance │
                     │  - Per-Question Reasoning Logs    │
                     └───────────────────────────────────┘
```

---

## 2. LLM-as-a-Judge Meta-Evaluation

### The Problem with Uncalibrated Evaluators
Using an automated LLM to grade another LLM can introduce severe bias, leniency, or hallucinated grading. Before deploying an LLM judge to evaluate thousands of matrix runs, you must measure its agreement with human annotations.

### Calibration Protocol
1. Filter the dataset to include verified human gold-standard test cases.
2. The candidate judge model (e.g. `llama3.2`, `gpt-4o-mini`) evaluates each question with the system prompt:
   ```text
   You are an expert automated RAG calibration judge. Output valid JSON only.
   Score the candidate answer against the context on Faithfulness [0.0 - 1.0] and Relevance [0.0 - 1.0].
   Provide explicit justification for your scores.
   ```
3. The platform calculates:
   $$\text{Agreement Score (\%)} = \left( \frac{\overline{\text{Faithfulness}} + \overline{\text{Answer Relevance}}}{2} \right) \times 100$$
4. Detailed reasoning logs are displayed per question, showing exactly how the model made its judgments.
