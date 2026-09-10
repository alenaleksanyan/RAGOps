from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.api.v1 import api_router
from app.core.config import get_settings
from app.core.database import Base, engine
from app.core.redis import close_redis

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ragbench")
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown lifecycle hooks."""
    logger.info("Initializing RAG-Bench database and extensions...")
    async with engine.begin() as conn:
        try:
            # Enable pgvector extension if available
            await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector;"))
            logger.info("pgvector extension verified.")
        except Exception as e:
            logger.warning(f"Could not enable pgvector extension automatically ({e}). Falling back.")

        # Create all tables
        await conn.run_sync(Base.metadata.create_all)
        try:
            await conn.execute(text("ALTER TABLE document_chunks ALTER COLUMN embedding TYPE vector;"))
        except Exception:
            pass
        logger.info("Database tables initialized successfully.")

    yield

    logger.info("Shutting down RAG-Bench...")
    await close_redis()
    await engine.dispose()


app = FastAPI(
    title="RAG-Bench API",
    description="RAG Evaluation & Experimentation Workbench – Asynchronous LLMOps developer platform",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS middleware for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins in development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount API routers
app.include_router(api_router)


@app.get("/health", tags=["Health"])
@app.get("/api/health", tags=["Health"])
async def health_check():
    """System health check endpoint."""
    return {
        "status": "healthy",
        "service": "ragbench-api",
        "environment": settings.app_env,
        "available_providers": settings.available_providers(),
    }
