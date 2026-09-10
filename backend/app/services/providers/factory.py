from __future__ import annotations

import logging
from typing import Any

from langchain_core.embeddings import Embeddings
from langchain_core.language_models.chat_models import BaseChatModel

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


def _is_valid_api_key(key: str | None) -> bool:
    """Check if key is non-empty and not a placeholder like sk-... or dummy text."""
    if not key:
        return False
    k = key.strip()
    if k in ("sk-...", "sk-ant-...", "AIza...", "gsk_...", "...", "none", "null"):
        return False
    if len(k) < 10:
        return False
    return True


class ModelProviderFactory:
    """Unified factory for creating LangChain Chat Models and Embedding instances across

    supported cloud (OpenAI, Anthropic, Google, Groq, Mistral, Cohere) and local
    (Ollama, HuggingFace, FastEmbed) providers.
    """

    @staticmethod
    def get_chat_model(
        provider: str | None = None,
        model_name: str | None = None,
        temperature: float = 0.0,
        api_key: str | None = None,
        extra_kwargs: dict[str, Any] | None = None,
    ) -> BaseChatModel:
        """Instantiate a LangChain chat model with runtime API key override or local fallback."""
        prov = (provider or settings.default_llm_provider).lower().strip()
        kwargs = extra_kwargs or {}

        # 1. OpenAI
        if prov == "openai":
            key = api_key or settings.openai_api_key
            if _is_valid_api_key(key):
                from langchain_openai import ChatOpenAI
                model = model_name or settings.default_llm_model or "gpt-4o-mini"
                return ChatOpenAI(model=model, temperature=temperature, api_key=key, **kwargs)
            logger.info("OpenAI key not configured; routing to local Ollama chat model.")
            prov = "ollama"

        # 2. Anthropic
        if prov == "anthropic":
            key = api_key or settings.anthropic_api_key
            if _is_valid_api_key(key):
                from langchain_anthropic import ChatAnthropic
                model = model_name or "claude-3-5-sonnet-20241022"
                return ChatAnthropic(model_name=model, temperature=temperature, api_key=key, **kwargs)
            logger.info("Anthropic key not configured; routing to local Ollama chat model.")
            prov = "ollama"

        # 3. Google Gemini
        if prov in ("google", "gemini"):
            key = api_key or settings.google_api_key
            if _is_valid_api_key(key):
                from langchain_google_genai import ChatGoogleGenerativeAI
                model = model_name or "gemini-1.5-flash"
                return ChatGoogleGenerativeAI(model=model, temperature=temperature, google_api_key=key, **kwargs)
            logger.info("Google key not configured; routing to local Ollama chat model.")
            prov = "ollama"

        # 4. Groq
        if prov == "groq":
            key = api_key or settings.groq_api_key
            if _is_valid_api_key(key):
                from langchain_groq import ChatGroq
                model = model_name or "llama-3.1-70b-versatile"
                return ChatGroq(model_name=model, temperature=temperature, api_key=key, **kwargs)
            prov = "ollama"

        # 5. Mistral
        if prov == "mistral":
            key = api_key or settings.mistral_api_key
            if _is_valid_api_key(key):
                from langchain_mistralai import ChatMistralAI
                model = model_name or "mistral-large-latest"
                return ChatMistralAI(model=model, temperature=temperature, api_key=key, **kwargs)
            prov = "ollama"

        # 6. Ollama / Local (Default)
        from langchain_ollama import ChatOllama

        base_url = kwargs.pop("base_url", settings.ollama_base_url)
        model = model_name or settings.ollama_default_model or "llama3.2"
        return ChatOllama(model=model, temperature=temperature, base_url=base_url, **kwargs)

    @staticmethod
    def get_embeddings(
        provider: str | None = None,
        model_name: str | None = None,
        api_key: str | None = None,
        extra_kwargs: dict[str, Any] | None = None,
    ) -> Embeddings:
        """Instantiate a LangChain Embeddings instance with FastEmbed local default."""
        prov = (provider or settings.default_embedding_provider).lower().strip()
        kwargs = extra_kwargs or {}

        # 1. OpenAI
        if prov == "openai":
            key = api_key or settings.openai_api_key
            if _is_valid_api_key(key):
                from langchain_openai import OpenAIEmbeddings
                model = model_name or "text-embedding-3-small"
                return OpenAIEmbeddings(model=model, api_key=key, **kwargs)
            logger.info("OpenAI key not configured; routing to zero-dependency local FastEmbed.")
            prov = "fastembed"

        # 2. Google Gemini
        if prov in ("google", "gemini"):
            key = api_key or settings.google_api_key
            if _is_valid_api_key(key):
                from langchain_google_genai import GoogleGenerativeAIEmbeddings
                model = model_name or "models/text-embedding-004"
                return GoogleGenerativeAIEmbeddings(model=model, google_api_key=key, **kwargs)
            prov = "fastembed"

        # 3. Ollama
        if prov == "ollama":
            from langchain_ollama import OllamaEmbeddings
            base_url = kwargs.pop("base_url", settings.ollama_base_url)
            model = model_name or settings.ollama_default_embedding_model or "nomic-embed-text"
            return OllamaEmbeddings(model=model, base_url=base_url, **kwargs)

        # 4. HuggingFace
        if prov == "huggingface":
            from langchain_huggingface import HuggingFaceEmbeddings
            model = model_name or "BAAI/bge-large-en-v1.5"
            device = kwargs.pop("device", settings.huggingface_device)
            return HuggingFaceEmbeddings(
                model_name=model,
                model_kwargs={"device": device},
                encode_kwargs={"normalize_embeddings": True},
            )

        # 5. FastEmbed (Local zero-dependency default)
        from langchain_community.embeddings.fastembed import FastEmbedEmbeddings
        model = model_name if model_name and "bge" in model_name else "BAAI/bge-small-en-v1.5"
        return FastEmbedEmbeddings(model_name=model, **kwargs)

    @staticmethod
    def get_embedding_dimension(provider: str, model_name: str) -> int:
        """Return expected vector dimensionality for common models to handle pgvector column matching."""
        name = model_name.lower()
        if "text-embedding-3-small" in name or "text-embedding-ada-002" in name:
            return 1536
        elif "text-embedding-3-large" in name:
            return 3072
        elif "bge-large" in name:
            return 1024
        elif "bge-small" in name or "all-minilm-l6-v2" in name:
            return 384
        elif "bge-base" in name or "nomic-embed-text" in name or "text-embedding-004" in name:
            return 768
        return 384
