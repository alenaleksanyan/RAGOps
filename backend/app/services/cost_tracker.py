from __future__ import annotations

from dataclasses import dataclass

# Pricing table: (prompt_cost_per_1k_tokens, completion_cost_per_1k_tokens) in USD
MODEL_PRICING: dict[str, tuple[float, float]] = {
    # OpenAI
    "gpt-4o": (0.005, 0.015),
    "gpt-4o-mini": (0.00015, 0.0006),
    "gpt-4-turbo": (0.01, 0.03),
    "gpt-3.5-turbo": (0.0005, 0.0015),
    # Anthropic
    "claude-3-5-sonnet-20241022": (0.003, 0.015),
    "claude-3-5-sonnet": (0.003, 0.015),
    "claude-3-haiku": (0.00025, 0.00125),
    "claude-3-opus": (0.015, 0.075),
    # Google
    "gemini-1.5-pro": (0.00125, 0.005),
    "gemini-1.5-flash": (0.000075, 0.0003),
    # Groq / Mistral / Local
    "llama-3.1-70b-versatile": (0.00059, 0.00079),
    "llama-3.1-8b-instant": (0.00005, 0.00008),
    "mistral-large-latest": (0.002, 0.006),
    "mistral-small-latest": (0.0002, 0.0006),
    # Ollama / HuggingFace local models
    "local": (0.0, 0.0),
    "ollama": (0.0, 0.0),
}

EMBEDDING_PRICING: dict[str, float] = {
    # Cost per 1k tokens in USD
    "text-embedding-3-small": 0.00002,
    "text-embedding-3-large": 0.00013,
    "text-embedding-ada-002": 0.0001,
    "models/text-embedding-004": 0.00002,
    "local": 0.0,
    "ollama": 0.0,
    "fastembed": 0.0,
}


@dataclass
class CostEstimate:
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    llm_cost_usd: float
    embedding_cost_usd: float
    total_cost_usd: float


class CostTracker:
    @staticmethod
    def calculate_llm_cost(
        model_name: str,
        prompt_tokens: int,
        completion_tokens: int,
        provider: str = "openai",
    ) -> float:
        if provider.lower() in ("ollama", "local", "fastembed", "huggingface"):
            return 0.0

        model_key = model_name.lower()
        pricing = None
        for k, v in MODEL_PRICING.items():
            if k in model_key:
                pricing = v
                break

        if not pricing:
            # Fallback average pricing
            pricing = (0.001, 0.002)

        prompt_cost = (prompt_tokens / 1000.0) * pricing[0]
        completion_cost = (completion_tokens / 1000.0) * pricing[1]
        return prompt_cost + completion_cost

    @staticmethod
    def calculate_embedding_cost(
        model_name: str,
        total_tokens: int,
        provider: str = "openai",
    ) -> float:
        if provider.lower() in ("ollama", "local", "fastembed", "huggingface"):
            return 0.0

        model_key = model_name.lower()
        cost_per_1k = 0.00002
        for k, v in EMBEDDING_PRICING.items():
            if k in model_key:
                cost_per_1k = v
                break

        return (total_tokens / 1000.0) * cost_per_1k
