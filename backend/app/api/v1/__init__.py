from fastapi import APIRouter

from app.api.v1.analytics import router as analytics_router
from app.api.v1.chat import router as chat_router
from app.api.v1.datasets import router as datasets_router
from app.api.v1.documents import router as documents_router
from app.api.v1.experiments import router as experiments_router
from app.api.v1.models import router as models_router
from app.api.v1.providers import router as providers_router

api_router = APIRouter(prefix="/api/v1")

api_router.include_router(documents_router)
api_router.include_router(datasets_router)
api_router.include_router(experiments_router)
api_router.include_router(models_router)
api_router.include_router(providers_router)
api_router.include_router(analytics_router)
api_router.include_router(chat_router)

__all__ = ["api_router"]
