from __future__ import annotations

from typing import Any

import redis.asyncio as aioredis
from arq.connections import RedisSettings

from app.core.config import get_settings

settings = get_settings()

# Async Redis client (shared pool)
redis_pool: aioredis.Redis | None = None
_arq_pool = None


async def get_redis() -> aioredis.Redis:
    global redis_pool
    if redis_pool is None:
        redis_pool = aioredis.from_url(
            settings.redis_url,
            encoding="utf-8",
            decode_responses=True,
            max_connections=20,
        )
    return redis_pool


async def get_arq_pool():
    global _arq_pool
    if _arq_pool is None:
        try:
            import arq

            _arq_pool = await arq.create_pool(get_arq_redis_settings())
        except Exception:
            _arq_pool = None
    return _arq_pool


async def close_redis() -> None:
    global redis_pool, _arq_pool
    if redis_pool is not None:
        await redis_pool.aclose()
        redis_pool = None
    if _arq_pool is not None:
        await _arq_pool.close()
        _arq_pool = None


def get_arq_redis_settings() -> RedisSettings:
    """ARQ Redis settings from environment config."""
    return RedisSettings(
        host=settings.redis_host,
        port=settings.redis_port,
    )


# ---- Job Status Helpers ----

async def set_job_progress(job_id: str, progress: dict[str, Any]) -> None:
    r = await get_redis()
    import json
    await r.setex(f"job:{job_id}:progress", 3600, json.dumps(progress))


async def get_job_progress(job_id: str) -> dict[str, Any] | None:
    r = await get_redis()
    import json
    raw = await r.get(f"job:{job_id}:progress")
    return json.loads(raw) if raw else None
