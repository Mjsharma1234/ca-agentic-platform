import os
from fastapi import FastAPI, Depends, APIRouter
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from contextlib import asynccontextmanager

from .core.config import settings
from .core.database import create_tables

from .api.v1.documents import router as documents_router
from .api.v1.gates import router as gates_router
from .api.v1.returns import router as returns_router
from .api.v1.dashboard import router as dashboard_router
from .api.v1.clients import router as clients_router
from .api.v1.firm_os import router as firm_os_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: create all tables (including firm_os tables)
    create_tables()
    yield
    # Shutdown

app = FastAPI(
    title=settings.APP_NAME,
    debug=settings.DEBUG,
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if settings.DEBUG else settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(firm_os_router)
api_router.include_router(gates_router)
api_router.include_router(documents_router)
api_router.include_router(returns_router)
api_router.include_router(dashboard_router)
api_router.include_router(clients_router)

@api_router.get("/health")
async def health_check_v1():
    return {"status": "ok", "app": settings.APP_NAME, "version": "v1.1-firm-os"}

@api_router.post("/seed")
async def seed_data():
    from .core.database import AsyncSessionLocal
    from .deterministic_core.seed_data import seed_database
    async with AsyncSessionLocal() as session:
        result = await seed_database(session)
        return result

app.include_router(api_router)

@app.get("/health")
async def health_check():
    return {"status": "ok", "app": settings.APP_NAME, "version": "v1.1-firm-os"}

# Mount the production CA Firm OS frontend
firm_os_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "firm_os_web"))
if os.path.exists(firm_os_path):
    app.mount("/os", StaticFiles(directory=firm_os_path, html=True), name="firm_os_explicit")
    app.mount("/", StaticFiles(directory=firm_os_path, html=True), name="firm_os_root")
else:
    @app.get("/")
    async def root():
        return {
            "status": "online",
            "app": settings.APP_NAME,
            "docs": "/docs",
            "health": "/health",
            "api_v1": "/api/v1"
        }
