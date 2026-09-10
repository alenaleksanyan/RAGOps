from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel

from app.core.config import get_settings

router = APIRouter(prefix="/providers", tags=["Model & Provider Registry"])
settings = get_settings()

PROVIDER_CATALOG = [
    {
        "provider": "openai",
        "name": "OpenAI",
        "type": "cloud",
        "chat_models": ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"],
        "embedding_models": ["text-embedding-3-small", "text-embedding-3-large", "text-embedding-ada-002"],
        "requires_api_key": True,
        "is_configured": bool(settings.openai_api_key),
    },
    {
        "provider": "anthropic",
        "name": "Anthropic",
        "type": "cloud",
        "chat_models": ["claude-3-5-sonnet-20241022", "claude-3-haiku-20240307", "claude-3-opus-20240229"],
        "embedding_models": [],
        "requires_api_key": True,
        "is_configured": bool(settings.anthropic_api_key),
    },
    {
        "provider": "google",
        "name": "Google Gemini",
        "type": "cloud",
        "chat_models": ["gemini-1.5-pro", "gemini-1.5-flash", "gemini-1.0-pro"],
        "embedding_models": ["models/text-embedding-004"],
        "requires_api_key": True,
        "is_configured": bool(settings.google_api_key),
    },
    {
        "provider": "groq",
        "name": "Groq",
        "type": "cloud",
        "chat_models": ["llama-3.1-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768", "gemma2-9b-it"],
        "embedding_models": [],
        "requires_api_key": True,
        "is_configured": bool(settings.groq_api_key),
    },
    {
        "provider": "mistral",
        "name": "Mistral AI",
        "type": "cloud",
        "chat_models": ["mistral-large-latest", "mistral-small-latest", "open-mixtral-8x7b"],
        "embedding_models": ["mistral-embed"],
        "requires_api_key": True,
        "is_configured": bool(settings.mistral_api_key),
    },
    {
        "provider": "ollama",
        "name": "Ollama (Local)",
        "type": "local",
        "chat_models": ["llama3.2", "llama3.1", "mistral", "qwen2.5", "phi3", "deepseek-r1"],
        "embedding_models": ["nomic-embed-text", "bge-m3", "all-minilm", "mxbai-embed-large"],
        "requires_api_key": False,
        "is_configured": True,
    },
    {
        "provider": "fastembed",
        "name": "FastEmbed (Local)",
        "type": "local",
        "chat_models": [],
        "embedding_models": ["BAAI/bge-small-en-v1.5", "BAAI/bge-base-en-v1.5", "sentence-transformers/all-MiniLM-L6-v2"],
        "requires_api_key": False,
        "is_configured": True,
    },
    {
        "provider": "huggingface",
        "name": "HuggingFace (Local / Inference)",
        "type": "local",
        "chat_models": [],
        "embedding_models": ["BAAI/bge-large-en-v1.5", "intfloat/e5-large-v2", "sentence-transformers/all-mpnet-base-v2"],
        "requires_api_key": False,
        "is_configured": True,
    },
]


@router.get("", response_model=list[dict[str, Any]])
async def list_providers():
    """Retrieve catalog of all supported cloud and local model providers with active configuration status."""
    return PROVIDER_CATALOG
