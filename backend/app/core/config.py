from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field, PostgresDsn, RedisDsn, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ---- Application ----
    app_env: Literal["development", "staging", "production"] = "development"

    # ---- Database ----
    postgres_user: str = "ragbench"
    postgres_password: str = "ragbench_secret"
    postgres_db: str = "ragbench"
    postgres_host: str = "postgres"
    postgres_port: int = 5432
    database_url: str = "postgresql+asyncpg://ragbench:ragbench_secret@postgres:5432/ragbench"

    # ---- Redis & ARQ ----
    redis_host: str = "redis"
    redis_port: int = 6379
    redis_url: str = "redis://redis:6379"

    # ---- Server ---
    backend_port: int = 8000
    frontend_port: int = 3000
    next_public_api_url: str = "http://localhost:8000"

    # =========================================================
    # LLM & Embedding Provider Keys
    # =========================================================
    openai_api_key: str | None = None
    anthropic_api_key: str | None = None
    google_api_key: str | None = None
    groq_api_key: str | None = None
    mistral_api_key: str | None = None
    cohere_api_key: str | None = None

    # ---- Ollama (local) ----
    ollama_base_url: str = "http://host.docker.internal:11434"
    ollama_default_model: str = "llama3.2"
    ollama_default_embedding_model: str = "nomic-embed-text"

    # ---- HuggingFace ----
    huggingface_api_key: str | None = None
    huggingface_device: str = "cpu"

    # ---- Default Provider Config (Local First) ----
    default_llm_provider: str = "ollama"
    default_llm_model: str = "llama3.2"
    default_embedding_provider: str = "fastembed"
    default_embedding_model: str = "BAAI/bge-small-en-v1.5"
    default_reranker: str = "none"

    # ---- Fixed Automated Evaluation / Judge Model (Decoupled from SUT) ----
    eval_llm_provider: str = "ollama"
    eval_llm_model: str = "gemma4:e4b"

    @model_validator(mode="after")
    def _validate_providers(self) -> "Settings":
        """Warn if the default provider key is missing — don't hard fail so local/Ollama still works."""
        if self.default_llm_provider == "openai" and not self.openai_api_key:
            import warnings
            warnings.warn(
                "DEFAULT_LLM_PROVIDER is 'openai' but OPENAI_API_KEY is not set. "
                "Switch to 'ollama' or set OPENAI_API_KEY in your .env file.",
                stacklevel=2,
            )
        return self

    def available_providers(self) -> list[str]:
        """Return list of providers with credentials configured."""
        providers: list[str] = ["ollama"]  # Always available (local)
        if self.openai_api_key:
            providers.append("openai")
        if self.anthropic_api_key:
            providers.append("anthropic")
        if self.google_api_key:
            providers.append("google")
        if self.groq_api_key:
            providers.append("groq")
        if self.mistral_api_key:
            providers.append("mistral")
        if self.cohere_api_key:
            providers.append("cohere")
        providers.append("huggingface")  # local HF models always available
        providers.append("fastembed")    # FastEmbed always available
        return providers


@lru_cache
def get_settings() -> Settings:
    return Settings()
