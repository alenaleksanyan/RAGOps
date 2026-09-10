# 📐 Evaluation Metrics & Mathematical Formulations

This document provides mathematical definitions, algorithms, and interpretation guidelines for all evaluation metrics calculated in **RAG-Bench**.

---

## 1. The RAG Triad

The RAG Triad evaluates the two core stages of any RAG pipeline: **Retrieval** and **Generation**.

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

---

## 2. Metric Formulations

### 1. Context Precision@k
Measures whether the relevant chunks are ranked at the top of the context window rather than buried at the bottom (mitigating the *Lost-in-the-Middle* effect):

$$\text{Context Precision@k} = \frac{\sum_{i=1}^k \left( \frac{|\text{Relevant Chunks in top } i|}{i} \times \text{IsRelevant}(i) \right)}{\text{Total Number of Relevant Chunks in top } k}$$

Where $\text{IsRelevant}(i) \in \{0, 1\}$ denotes whether chunk $i$ contains information answering the question.

---

### 2. Context Recall
Measures the completeness of retrieval by determining if all essential facts from the ground-truth answer are present in the retrieved passages:

$$\text{Context Recall} = \frac{|\text{Ground-Truth Sentences Supported by Retrieved Context}|}{|\text{Total Sentences in Ground-Truth Answer}|}$$

---

### 3. Faithfulness (Hallucination Index)
Measures the factual fidelity of the generated answer against the retrieved context:

$$\text{Faithfulness} = \frac{|\text{Atomic Claims in Response Directly Grounded in Context}|}{|\text{Total Atomic Claims in Generated Response}|}$$

- **1.0**: Zero hallucination; every assertion is backed by retrieved passages.
- **< 0.7**: High hallucination risk; generator is extrapolating beyond source documents.

---

### 4. Answer Relevance
Measures whether the generated response directly answers the user's question without extraneous fluff or tangents:

$$\text{Answer Relevance} = \frac{\mathbf{e}_{\text{question}} \cdot \mathbf{e}_{\text{answer}}}{\|\mathbf{e}_{\text{question}}\| \|\mathbf{e}_{\text{answer}}\|}$$

Where $\mathbf{e}_{\text{question}}$ and $\mathbf{e}_{\text{answer}}$ are neural sentence embedding vectors.

---

### 5. Context Utilization Rate
Measures what percentage of the context tokens fed to the LLM were actually cited or used in the final answer:

$$\text{Context Utilization Rate} = \frac{\text{Tokens in Context Cited by Answer}}{\text{Total Tokens in Context Window}}$$

---

### 6. Context Noise Ratio
Measures the proportion of distractor or irrelevant chunks included in the context window:

$$\text{Context Noise Ratio} = \frac{|\{c \in \text{Retrieved Chunks} \mid \text{Similarity}(c, q) < \tau\}|}{k}$$

---

### 7. Reciprocal Rank Fusion (RRF) for Hybrid Search
Combines dense vector similarity rankings and sparse BM25 keyword rankings:

$$\text{RRF\_Score}(d) = \sum_{m \in \{\text{Dense}, \text{BM25}\}} \frac{1}{60 + \text{rank}_m(d)}$$
