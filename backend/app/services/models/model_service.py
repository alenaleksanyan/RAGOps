from __future__ import annotations

import asyncio
import glob
import json
import logging
import os
from typing import AsyncGenerator
import httpx

from app.core.config import get_settings
from app.schemas.model import ModelInfo, ModelPullProgress

logger = logging.getLogger(__name__)


# Curated catalog of models with metadata
KNOWN_MODELS: list[dict] = [
    # ---- Local LLMs (Ollama) ----
    {
        "name": "llama3.2",
        "provider": "ollama",
        "type": "llm",
        "ram_required": "~2.5 GB RAM",
        "parameter_size": "3B",
        "description": "Meta Llama 3.2 3B - Ultra fast, high quality lightweight LLM for RAG.",
    },
    {
        "name": "llama3.2:1b",
        "provider": "ollama",
        "type": "llm",
        "ram_required": "~1.5 GB RAM",
        "parameter_size": "1B",
        "description": "Meta Llama 3.2 1B - Featherweight local LLM with minimal footprint.",
    },
    {
        "name": "llama3.1:8b",
        "provider": "ollama",
        "type": "llm",
        "ram_required": "~6.0 GB RAM",
        "parameter_size": "8B",
        "description": "Meta Llama 3.1 8B - Powerful general reasoning and evaluation model.",
    },
    {
        "name": "gemma4:e4b",
        "provider": "ollama",
        "type": "llm",
        "ram_required": "~9.0 GB RAM",
        "parameter_size": "7.5B",
        "description": "Google Gemma 4 E4B - High capability multimodal & text reasoning.",
    },
    {
        "name": "mistral:7b",
        "provider": "ollama",
        "type": "llm",
        "ram_required": "~5.5 GB RAM",
        "parameter_size": "7B",
        "description": "Mistral 7B Instruct - Fast, battle-tested open weight model.",
    },
    {
        "name": "qwen2.5:7b",
        "provider": "ollama",
        "type": "llm",
        "ram_required": "~5.5 GB RAM",
        "parameter_size": "7B",
        "description": "Qwen 2.5 7B - Exceptional coding, multilingual, and structured output.",
    },
    {
        "name": "qwen2.5:3b",
        "provider": "ollama",
        "type": "llm",
        "ram_required": "~2.8 GB RAM",
        "parameter_size": "3B",
        "description": "Qwen 2.5 3B - Compact, high efficiency RAG generator.",
    },
    {
        "name": "phi3:mini",
        "provider": "ollama",
        "type": "llm",
        "ram_required": "~3.0 GB RAM",
        "parameter_size": "3.8B",
        "description": "Microsoft Phi-3 Mini - Optimized for compact device reasoning.",
    },
    # ---- Local Embedding Models (Ollama) ----
    {
        "name": "nomic-embed-text",
        "provider": "ollama",
        "type": "embedding",
        "ram_required": "~500 MB RAM",
        "parameter_size": "137M",
        "description": "Nomic Embed Text v1.5 - Top tier open 8192-token context embeddings.",
    },
    {
        "name": "mxbai-embed-large",
        "provider": "ollama",
        "type": "embedding",
        "ram_required": "~700 MB RAM",
        "parameter_size": "335M",
        "description": "MixedBread AI Embed Large - SOTA MTEB benchmark performance.",
    },
    {
        "name": "all-minilm",
        "provider": "ollama",
        "type": "embedding",
        "ram_required": "~200 MB RAM",
        "parameter_size": "33M",
        "description": "All MiniLM L6 v2 - Ultra lightweight local embedding model.",
    },
    {
        "name": "bge-m3",
        "provider": "ollama",
        "type": "embedding",
        "ram_required": "~1.2 GB RAM",
        "parameter_size": "567M",
        "description": "BAAI BGE-M3 - Multi-Lingual, Multi-Functionality, Multi-Granularity.",
    },
    {
        "name": "snowflake-arctic-embed",
        "provider": "ollama",
        "type": "embedding",
        "ram_required": "~400 MB RAM",
        "parameter_size": "110M",
        "description": "Snowflake Arctic Embed - Optimized for production search and retrieval.",
    },
    # ---- Local FastEmbed / ONNX Embeddings ----
    {
        "name": "BAAI/bge-small-en-v1.5",
        "provider": "fastembed",
        "type": "embedding",
        "ram_required": "~150 MB RAM",
        "parameter_size": "33M",
        "description": "FastEmbed BGE Small v1.5 - High-speed CPU ONNX vectorization.",
    },
    {
        "name": "BAAI/bge-large-en-v1.5",
        "provider": "fastembed",
        "type": "embedding",
        "ram_required": "~600 MB RAM",
        "parameter_size": "335M",
        "description": "FastEmbed BGE Large v1.5 - High accuracy ONNX vector embedding.",
    },
    {
        "name": "sentence-transformers/all-MiniLM-L6-v2",
        "provider": "fastembed",
        "type": "embedding",
        "ram_required": "~120 MB RAM",
        "parameter_size": "22M",
        "description": "FastEmbed MiniLM L6 v2 - Lightweight ONNX vector engine.",
    },
]


def _format_size(size_bytes: int | None) -> str | None:
    if size_bytes is None:
        return None
    if size_bytes >= 1024 * 1024 * 1024:
        return f"{size_bytes / (1024 * 1024 * 1024):.1f} GB"
    if size_bytes >= 1024 * 1024:
        return f"{size_bytes / (1024 * 1024):.1f} MB"
    return f"{size_bytes / 1024:.1f} KB"


class ModelService:
    @classmethod
    async def get_ollama_tags(cls) -> list[dict]:
        """Query Ollama /api/tags for downloaded models."""
        settings = get_settings()
        url = f"{settings.ollama_base_url.rstrip('/')}/api/tags"
        try:
            async with httpx.AsyncClient(timeout=4.0) as client:
                res = await client.get(url)
                if res.status_code == 200:
                    return res.json().get("models", [])
        except Exception as e:
            logger.debug(f"Ollama tags fetch error: {e}")
        return []

    @classmethod
    def check_fastembed_cached(cls, model_name: str) -> tuple[bool, int | None]:
        """Check if FastEmbed / HF model ONNX files exist in cache dirs."""
        cache_dirs = [
            os.path.expanduser("~/.cache/fastembed"),
            os.path.expanduser("~/.cache/huggingface/hub"),
            "/root/.cache/fastembed",
            "/root/.cache/huggingface/hub",
            "/tmp/fastembed_cache",
        ]
        sanitized = model_name.replace("/", "--").replace(":", "--").lower()
        for base in cache_dirs:
            if not os.path.exists(base):
                continue
            for root, dirs, files in os.walk(base):
                if sanitized in root.lower() or any(sanitized in d.lower() for d in dirs):
                    total_sz = sum(
                        os.path.getsize(os.path.join(root, f))
                        for f in files
                        if os.path.isfile(os.path.join(root, f))
                    )
                    return True, total_sz or None
                # Check for onnx files matching model name
                for f in files:
                    if f.endswith(".onnx") and any(part in root.lower() for part in model_name.lower().split("/")):
                        return True, os.path.getsize(os.path.join(root, f))
        return False, None

    @classmethod
    async def list_all_models(cls) -> list[ModelInfo]:
        """List both downloaded and available models with rich metadata."""
        ollama_models = await cls.get_ollama_tags()
        ollama_map: dict[str, dict] = {}
        for m in ollama_models:
            name = m.get("name", "")
            ollama_map[name] = m
            # Also map without :latest
            if name.endswith(":latest"):
                ollama_map[name.replace(":latest", "")] = m

        result: list[ModelInfo] = []
        registered_keys = set()

        # 1. Process curated models
        for km in KNOWN_MODELS:
            name = km["name"]
            provider = km["provider"]
            mtype = km["type"]
            key = f"{provider}:{name}"
            registered_keys.add(key)

            is_down = False
            sz_bytes = None
            modified = None
            quant = None

            if provider == "ollama":
                if name in ollama_map:
                    is_down = True
                    om = ollama_map[name]
                    sz_bytes = om.get("size")
                    modified = om.get("modified_at")
                    quant = om.get("details", {}).get("quantization_level")
            elif provider == "fastembed":
                is_down, sz_bytes = cls.check_fastembed_cached(name)

            result.append(
                ModelInfo(
                    id=key,
                    name=name,
                    provider=provider,
                    type=mtype,
                    is_downloaded=is_down,
                    size_bytes=sz_bytes,
                    size_formatted=_format_size(sz_bytes),
                    ram_required=km.get("ram_required"),
                    description=km.get("description"),
                    modified_at=modified,
                    parameter_size=km.get("parameter_size"),
                    quantization=quant,
                )
            )

        # 2. Add any additional Ollama models downloaded by the user not in curated list
        for name, om in ollama_map.items():
            base_name = name.removesuffix(":latest")
            key = f"ollama:{base_name}"
            if key in registered_keys or f"ollama:{name}" in registered_keys or f"ollama:{name}:latest" in registered_keys:
                continue
            registered_keys.add(key)
            registered_keys.add(f"ollama:{name}")
            registered_keys.add(f"ollama:{name}:latest")

            sz = om.get("size")
            details = om.get("details", {})
            family = details.get("family", "")
            is_embed = "embed" in name.lower() or "bert" in family.lower()

            result.append(
                ModelInfo(
                    id=key,
                    name=name,
                    provider="ollama",
                    type="embedding" if is_embed else "llm",
                    is_downloaded=True,
                    size_bytes=sz,
                    size_formatted=_format_size(sz),
                    ram_required=f"~{max(1, (sz or 0) // (1024**3) + 1)} GB RAM",
                    description=f"Local Ollama model ({details.get('parameter_size', '')} {details.get('quantization_level', '')})",
                    modified_at=om.get("modified_at"),
                    parameter_size=details.get("parameter_size"),
                    quantization=details.get("quantization_level"),
                )
            )

        return result

    @classmethod
    async def pull_model_stream(cls, model_name: str, provider: str = "ollama") -> AsyncGenerator[ModelPullProgress, None]:
        """Stream real-time download progress for Ollama or FastEmbed."""
        if provider == "fastembed":
            yield ModelPullProgress(
                model_name=model_name,
                status="downloading",
                percentage=10,
                speed_formatted="Fetching ONNX weights...",
            )
            try:
                from fastembed import TextEmbedding

                # Run download in worker thread
                await asyncio.to_thread(TextEmbedding, model_name=model_name)
                yield ModelPullProgress(
                    model_name=model_name,
                    status="success",
                    percentage=100,
                    completed=100,
                    total=100,
                    speed_formatted="Ready",
                )
            except Exception as e:
                logger.error(f"FastEmbed pull failed: {e}")
                yield ModelPullProgress(
                    model_name=model_name,
                    status="error",
                    error=str(e),
                )
            return

        # Ollama streaming pull
        settings = get_settings()
        url = f"{settings.ollama_base_url.rstrip('/')}/api/pull"

        try:
            async with httpx.AsyncClient(timeout=1800.0) as client:
                async with client.stream("POST", url, json={"name": model_name, "stream": True}) as response:
                    if response.status_code != 200:
                        yield ModelPullProgress(
                            model_name=model_name,
                            status="error",
                            error=f"Ollama returned HTTP {response.status_code}",
                        )
                        return

                    async for line in response.aiter_lines():
                        if not line.strip():
                            continue
                        try:
                            data = json.loads(line)
                            status_text = data.get("status", "downloading")
                            total = data.get("total")
                            completed = data.get("completed")
                            pct = None
                            if total and completed and total > 0:
                                pct = int((completed / total) * 100)

                            speed = None
                            if total and completed:
                                speed = f"{_format_size(completed)} / {_format_size(total)}"

                            yield ModelPullProgress(
                                model_name=model_name,
                                status=status_text,
                                digest=data.get("digest"),
                                total=total,
                                completed=completed,
                                percentage=pct,
                                speed_formatted=speed,
                                error=data.get("error"),
                            )
                        except Exception:
                            pass
        except Exception as e:
            logger.error(f"Ollama stream pull error: {e}")
            yield ModelPullProgress(
                model_name=model_name,
                status="error",
                error=str(e),
            )

    @classmethod
    async def delete_ollama_model(cls, model_name: str) -> bool:
        """Delete a model from Ollama."""
        settings = get_settings()
        url = f"{settings.ollama_base_url.rstrip('/')}/api/delete"
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.request("DELETE", url, json={"name": model_name})
                return res.status_code == 200
        except Exception as e:
            logger.error(f"Ollama delete error: {e}")
            return False
