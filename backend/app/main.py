from fastapi import FastAPI, Depends, APIRouter
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from .core.config import settings
from .core.database import create_tables

from .api.v1.documents import router as documents_router
from .api.v1.gates import router as gates_router
from .api.v1.returns import router as returns_router
from .api.v1.dashboard import router as dashboard_router
from .api.v1.clients import router as clients_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: create tables
    await create_tables()
    yield
    # Shutdown

app = FastAPI(
    title=settings.APP_NAME,
    debug=settings.DEBUG,
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(gates_router)
api_router.include_router(documents_router)
api_router.include_router(returns_router)
api_router.include_router(dashboard_router)
api_router.include_router(clients_router)

@api_router.post("/seed")
async def seed_data():
    from .core.database import AsyncSessionLocal
    from .deterministic_core.seed_data import seed_database
    async with AsyncSessionLocal() as session:
        result = await seed_database(session)
        return result

app.include_router(api_router)

@app.get("/")
async def root():
    return {
        "status": "online",
        "app": settings.APP_NAME,
        "docs": "/docs",
        "health": "/health",
        "api_v1": "/api/v1"
    }

@app.get("/health")
async def health_check():
    return {"status": "ok", "app": settings.APP_NAME}
