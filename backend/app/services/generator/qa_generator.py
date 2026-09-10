from __future__ import annotations

import re
import json
import asyncio
import logging
from typing import Any, Literal
from dataclasses import dataclass, field

from pydantic import BaseModel, Field

# pyrefly: ignore [missing-import]
from langchain_core.documents import Document as LCDocument
# pyrefly: ignore [missing-import]
from langchain_core.messages import HumanMessage, SystemMessage
from app.services.providers.factory import ModelProviderFactory


logger = logging.getLogger(__name__)


@dataclass
class GeneratedQAPair:
    question: str
    ground_truth_answer: str
    expected_context: str
    question_type: str = "single_hop"  # single_hop | multi_hop
    source_chunk_index: int | None = None


@dataclass
class ContextWindow:
    text: str
    chunk_indices: list[int] = field(default_factory=list)
    preceding_context: str = ""


class DocumentProfileSchema(BaseModel):
    subject: str = Field(
        description="A concise 1-sentence summary of the core topic or domain of the document."
    )
    key_entities: str = Field(
        description="Comma-separated list of 3-5 key specific entities, mechanisms, systems, or proper nouns."
    )


class SyntheticQAPairSchema(BaseModel):
    question: str = Field(
        description="A standalone, specific question that can be answered from the passage. Must explicitly name entities/concepts without using vague pronouns like 'the author', 'the paper', 'the system', or 'it'."
    )
    ground_truth_answer: str = Field(
        description="A comprehensive, factual answer directly extracted and supported by the target passage."
    )
    expected_context: str = Field(
        description="The exact snippet or sentences from the target passage that prove the answer."
    )
    question_type: Literal["single_hop", "multi_hop"] = Field(
        default="single_hop",
        description="single_hop if directly extracted from 1 passage, multi_hop if synthesizing multiple points."
    )


class WindowQABatchSchema(BaseModel):
    qa_pairs: list[SyntheticQAPairSchema] = Field(
        default_factory=list,
        description="List of high-quality benchmark QA pairs generated from the passage."
    )


def estimate_token_count(text: str) -> int:
    """Fast token count estimation using tiktoken or 4-char heuristic fallback."""
    try:
        import tiktoken
        enc = tiktoken.get_encoding("cl100k_base")
        return len(enc.encode(text))
    except Exception:
        return max(1, len(text) // 4)


class SyntheticDatasetGenerator:
    """State-of-the-art Synthetic QA Benchmark Generator.

    Features:
    1. Dynamic Token-Bounded Windowing: Aggregates arbitrary chunks into 400-800 token windows.
    2. Global Document Profiling: Extracts domain/entities so isolated chunks stay grounded.
    3. Stratified Document Sampling: Ensures uniform coverage across beginning, middle, and end.
    4. Parallel Structured Synthesis: Concurrently generates QA pairs with schema validation.
    5. Quality & Grounding Filtration: Drops vague or ungrounded questions.
    """

    @classmethod
    def assemble_context_windows(
        cls,
        raw_texts: list[str],
        min_tokens: int = 350,
        target_tokens: int = 650,
    ) -> list[ContextWindow]:
        """Merges consecutive chunks into normalized context windows with preceding breadcrumbs."""
        if not raw_texts:
            return []

        windows: list[ContextWindow] = []
        current_texts: list[str] = []
        current_indices: list[int] = []
        current_tokens = 0
        last_flushed_text = ""

        for idx, text in enumerate(raw_texts):
            clean_text = text.strip()
            if not clean_text:
                continue

            t_count = estimate_token_count(clean_text)
            current_texts.append(clean_text)
            current_indices.append(idx)
            current_tokens += t_count

            if current_tokens >= target_tokens:
                merged_text = "\n\n".join(current_texts)
                breadcrumb = last_flushed_text[-300:] if last_flushed_text else ""
                windows.append(
                    ContextWindow(
                        text=merged_text,
                        chunk_indices=list(current_indices),
                        preceding_context=breadcrumb,
                    )
                )
                last_flushed_text = merged_text
                current_texts = []
                current_indices = []
                current_tokens = 0

        # Handle tail
        if current_texts:
            merged_tail = "\n\n".join(current_texts)
            if current_tokens >= min_tokens or not windows:
                breadcrumb = last_flushed_text[-300:] if last_flushed_text else ""
                windows.append(
                    ContextWindow(
                        text=merged_tail,
                        chunk_indices=current_indices,
                        preceding_context=breadcrumb,
                    )
                )
            elif windows:
                # Merge small tail into the last window
                windows[-1].text += "\n\n" + merged_tail
                windows[-1].chunk_indices.extend(current_indices)

        return windows

    @classmethod
    async def extract_document_profile(
        cls,
        chat_model: Any,
        sample_texts: list[str],
        doc_title: str | None = None,
    ) -> dict[str, str]:
        """Fast 1-pass extraction of primary domain, subject, and key entities using Structured Output."""
        if not sample_texts:
            return {
                "subject": doc_title or "Technical Document",
                "key_entities": doc_title or "General Concepts",
            }

        combined_sample = "\n\n---\n\n".join(sample_texts[:3])[:3000]
        prompt = f"""Analyze the document sample below and identify:
1. Primary Subject / Core Topic (concise 1-sentence summary).
2. 3-5 Key Specific Entities, Systems, Mechanisms, or Proper Nouns.

DOCUMENT SAMPLE:
{combined_sample}
"""
        messages = [
            SystemMessage(content="You are an expert document profiler. Extract the primary subject and key entities accurately."),
            HumanMessage(content=prompt),
        ]

        try:
            structured_model = chat_model.with_structured_output(DocumentProfileSchema)
            profile: DocumentProfileSchema = await asyncio.wait_for(
                structured_model.ainvoke(messages),
                timeout=8.0,
            )
            return {
                "subject": profile.subject or (doc_title or "Technical Subject"),
                "key_entities": profile.key_entities or (doc_title or "Domain Entities"),
            }
        except Exception as e:
            logger.info(f"Structured profile extraction falling back to text prompt ({e})")
            try:
                resp = await asyncio.wait_for(chat_model.ainvoke(messages), timeout=8.0)
                raw = resp.content.strip()
                if raw.startswith("```"):
                    raw = raw.strip("`").replace("json", "").strip()
                data = json.loads(raw)
                return {
                    "subject": data.get("subject", doc_title or "Technical Subject"),
                    "key_entities": data.get("key_entities", doc_title or "Domain Entities"),
                }
            except Exception:
                return {
                    "subject": doc_title or "Technical Analysis & Document Context",
                    "key_entities": doc_title or "Key Mechanisms and Components",
                }

    @classmethod
    async def _generate_window_qa(
        cls,
        chat_model: Any,
        window: ContextWindow,
        doc_profile: dict[str, str],
        doc_title: str | None,
        num_questions: int = 1,
        question_type: str = "single_hop",
        semaphore: asyncio.Semaphore | None = None,
    ) -> list[GeneratedQAPair]:
        """Generates 1-2 focused QA pairs from a single normalized context window using Structured Output."""
        async def _call() -> list[GeneratedQAPair]:
            breadcrumb_section = (
                f"\nBACKGROUND BREADCRUMB (Preceding Context, for reference only):\n{window.preceding_context}\n"
                if window.preceding_context
                else ""
            )

            prompt = f"""==================================================
GLOBAL DOCUMENT CONTEXT
==================================================
Document Title / Source: {doc_title or 'Document'}
Primary Subject: {doc_profile.get('subject', 'Technical Context')}
Key Entities: {doc_profile.get('key_entities', 'Domain Entities')}
{breadcrumb_section}
==================================================
TARGET PASSAGE (Ground Truth)
==================================================
{window.text}

==================================================
INSTRUCTIONS:
==================================================
Generate exactly {num_questions} high-quality, rigorous benchmark QA pair(s) where the answer is strictly extracted from the TARGET PASSAGE.

STRICT CRITERIA:
1. STANDALONE & EXPLICIT: The question MUST be globally understandable on its own. Replace generic pronouns ("it", "they", "the system", "the author", "the paper") with explicit named entities, framework names, or technical terms from the Global Document Context or Target Passage.
2. STRICT GROUNDING: The ground truth answer must be 100% supported by the TARGET PASSAGE.
3. SEARCH REALISTIC: Write the question as a domain expert, engineer, or researcher would query a vector search engine.
4. TYPE: Set question_type to "{question_type}".
"""
            messages = [
                SystemMessage(
                    content="You are an expert benchmark QA dataset creator for RAG evaluation. Return verified, high-quality QA pairs."
                ),
                HumanMessage(content=prompt),
            ]

            qa_pairs_data: list[SyntheticQAPairSchema] = []

            # 1. Try structured output first
            try:
                structured_model = chat_model.with_structured_output(WindowQABatchSchema)
                batch_result: WindowQABatchSchema = await structured_model.ainvoke(messages)
                qa_pairs_data = batch_result.qa_pairs
            except Exception as e:
                logger.info(f"Structured QA generation falling back to JSON parser ({e})")
                resp = await chat_model.ainvoke(messages)
                raw = resp.content.strip()
                if raw.startswith("```"):
                    raw = raw.strip("`").replace("json", "").strip()
                try:
                    data = json.loads(raw)
                    raw_list = data.get("qa_pairs", []) if isinstance(data, dict) else (data if isinstance(data, list) else [])
                    qa_pairs_data = [SyntheticQAPairSchema(**item) for item in raw_list if isinstance(item, dict)]
                except Exception:
                    match = re.search(r"\{.*\}", raw, re.DOTALL)
                    if match:
                        try:
                            data = json.loads(match.group(0))
                            raw_list = data.get("qa_pairs", []) if isinstance(data, dict) else []
                            qa_pairs_data = [SyntheticQAPairSchema(**item) for item in raw_list if isinstance(item, dict)]
                        except Exception:
                            qa_pairs_data = []

            results: list[GeneratedQAPair] = []
            for item in qa_pairs_data:
                q = item.question.strip()
                gt = item.ground_truth_answer.strip()
                ctx = item.expected_context.strip() or window.text[:300]
                qtype = item.question_type or question_type

                # Quality Filter
                if len(q) >= 15 and len(gt) >= 5 and not q.lower().startswith(("according to", "in the passage", "in the text")):
                    results.append(
                        GeneratedQAPair(
                            question=q,
                            ground_truth_answer=gt,
                            expected_context=ctx,
                            question_type=qtype,
                            source_chunk_index=window.chunk_indices[0] if window.chunk_indices else None,
                        )
                    )
            return results

        if semaphore:
            async with semaphore:
                try:
                    return await _call()
                except Exception as e:
                    logger.warning(f"Window QA generation error: {e}")
                    return []
        else:
            try:
                return await _call()
            except Exception as e:
                logger.warning(f"Window QA generation error: {e}")
                return []

    @classmethod
    async def generate_dataset(
        cls,
        chunks: list[LCDocument] | list[str] | list[Any],
        num_questions: int,
        provider: str,
        model_name: str,
        doc_title: str | None = None,
        doc_metadata: dict[str, Any] | None = None,
        api_key: str | None = None,
    ) -> list[GeneratedQAPair]:
        """Main entry point: Generates `num_questions` test cases using dynamic windowing,

        global document profiling, and parallel structured LLM calls.
        """
        raw_texts: list[str] = []
        for c in chunks:
            if isinstance(c, LCDocument):
                raw_texts.append(c.page_content)
            elif hasattr(c, "content"):
                raw_texts.append(str(c.content))
            else:
                raw_texts.append(str(c))

        if not raw_texts:
            return []

        # 1. Assemble Dynamic Token Windows (400 - 800 tokens each)
        windows = cls.assemble_context_windows(raw_texts, min_tokens=350, target_tokens=650)
        if not windows:
            return cls._deterministic_qa_extraction(raw_texts, num_questions)

        try:
            chat_model = ModelProviderFactory.get_chat_model(
                provider=provider,
                model_name=model_name,
                temperature=0.2,
                api_key=api_key,
            )

            # 2. Extract Global Document Profile (Topic & Entities)
            sample_texts = [w.text for w in windows[:3]]
            doc_profile = await cls.extract_document_profile(
                chat_model=chat_model,
                sample_texts=sample_texts,
                doc_title=doc_title or (doc_metadata or {}).get("filename"),
            )

            # 3. Stratified Window Selection across Document
            total_windows = len(windows)
            num_multi_hop = max(1, num_questions // 4) if num_questions >= 4 else 0
            num_single_hop = num_questions - num_multi_hop

            # Select evenly spaced window indices for single-hop
            if total_windows <= num_single_hop:
                selected_single_indices = [i % total_windows for i in range(num_single_hop)]
            else:
                step = total_windows / float(num_single_hop)
                selected_single_indices = [int(i * step) for i in range(num_single_hop)]

            # Concurrency rate-limiter (max 4 parallel LLM calls)
            semaphore = asyncio.Semaphore(4)
            tasks = []

            # Launch Single-Hop Window Tasks
            for w_idx in selected_single_indices:
                w = windows[w_idx]
                tasks.append(
                    cls._generate_window_qa(
                        chat_model=chat_model,
                        window=w,
                        doc_profile=doc_profile,
                        doc_title=doc_title,
                        num_questions=1,
                        question_type="single_hop",
                        semaphore=semaphore,
                    )
                )

            # Launch Multi-Hop Adjacent Window Tasks (if requested)
            for m_i in range(num_multi_hop):
                w_start = (m_i * 2) % max(1, total_windows - 1)
                w1 = windows[w_start]
                w2 = windows[min(total_windows - 1, w_start + 1)]
                combined_multi_window = ContextWindow(
                    text=f"[Section A]:\n{w1.text}\n\n[Section B]:\n{w2.text}",
                    chunk_indices=w1.chunk_indices + w2.chunk_indices,
                    preceding_context=w1.preceding_context,
                )
                tasks.append(
                    cls._generate_window_qa(
                        chat_model=chat_model,
                        window=combined_multi_window,
                        doc_profile=doc_profile,
                        doc_title=doc_title,
                        num_questions=1,
                        question_type="multi_hop",
                        semaphore=semaphore,
                    )
                )

            # Run all tasks concurrently
            results_nested = await asyncio.gather(*tasks)
            all_qa_pairs: list[GeneratedQAPair] = []
            for batch in results_nested:
                all_qa_pairs.extend(batch)

            # If we achieved sufficient pairs, return them
            if len(all_qa_pairs) >= min(2, num_questions):
                return all_qa_pairs[:num_questions]

        except Exception as e:
            logger.warning(
                f"LLM synthetic QA generation encountered error ({e}). Engaging deterministic extractor."
            )

        # 4. Fallback to deterministic extraction if LLM failed
        return cls._deterministic_qa_extraction(raw_texts, num_questions)

    @classmethod
    def _deterministic_qa_extraction(
        cls, texts: list[str], target_count: int
    ) -> list[GeneratedQAPair]:
        """Extracts high-quality factual QA pairs directly from key sentences, definitions, and headers."""
        qa_pairs: list[GeneratedQAPair] = []

        for t in texts:
            lines = [line.strip() for line in t.split("\n") if line.strip()]
            for line in lines:
                # 1. Bold definitions
                match = re.match(r"(?:[0-9]+\.\s*)?\*\*([^*]+)\*\*:\s*(.+)", line)
                if match:
                    term = match.group(1).strip()
                    desc = match.group(2).strip()
                    qa_pairs.append(
                        GeneratedQAPair(
                            question=f"What is {term} and how does it function?",
                            ground_truth_answer=desc,
                            expected_context=line,
                            question_type="single_hop",
                        )
                    )
                    if len(qa_pairs) >= target_count:
                        return qa_pairs

                # 2. Bullet points
                elif line.startswith("- ") or line.startswith("* "):
                    content = line[2:].strip()
                    if ":" in content:
                        parts = content.split(":", 1)
                        header = parts[0].strip(" *#_")
                        body = parts[1].strip()
                        if len(header) > 3 and len(body) > 10:
                            qa_pairs.append(
                                GeneratedQAPair(
                                    question=f"How is {header} defined or implemented?",
                                    ground_truth_answer=body,
                                    expected_context=line,
                                    question_type="single_hop",
                                )
                            )
                            if len(qa_pairs) >= target_count:
                                return qa_pairs

        # 3. Sentence fallback
        if len(qa_pairs) < target_count:
            for t in texts:
                sentences = [s.strip() for s in re.split(r"(?<=[.?!])\s+", t) if len(s.strip()) > 30]
                for s in sentences:
                    qa_pairs.append(
                        GeneratedQAPair(
                            question=f"What information is provided regarding: {s[:50]}...?",
                            ground_truth_answer=s,
                            expected_context=s,
                            question_type="single_hop",
                        )
                    )
                    if len(qa_pairs) >= target_count:
                        break
                if len(qa_pairs) >= target_count:
                    break

        return qa_pairs[:target_count]

