import os
from fastapi import FastAPI, Depends, APIRouter, Request, HTTPException, status, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, Response
from contextlib import asynccontextmanager
from typing import Optional

from .core.config import settings
from .api.deps import require_role
from .core.database import create_tables, engine, AdminSessionLocal
from .core.db_security import enforce_rls_posture

from .api.v1.documents import router as documents_router
from .api.v1.gates import router as gates_router
from .api.v1.returns import router as returns_router
from .api.v1.dashboard import router as dashboard_router
from .api.v1.clients import router as clients_router
from .api.v1.firm_os import router as firm_os_router
from .api.v1.billing import router as billing_router
from .api.v1.bank_reco import router as bank_reco_router
from .api.v1.auth import router as auth_router
from .api.v1.signing import router as signing_router
from .api.v1.signer_devices import router as signer_devices_router

# Pre-initialize database tables synchronously
create_tables()

@asynccontextmanager
async def lifespan(app: FastAPI):
    enforce_rls_posture(engine, production=not settings.DEBUG)
    yield

app = FastAPI(
    title=settings.APP_NAME,
    debug=settings.DEBUG,
    lifespan=lifespan
)

# 1. Security Headers Middleware
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response: Response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "SAMEORIGIN"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    return response

# 2. Strict CORS Configuration
TRUSTED_ORIGINS = [
    "https://firmosweb.vercel.app",
    "https://ca-agentic-platform.vercel.app",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
]
if settings.CORS_ORIGINS and settings.CORS_ORIGINS != ["*"]:
    for o in settings.CORS_ORIGINS:
        if o not in TRUSTED_ORIGINS:
            TRUSTED_ORIGINS.append(o)

app.add_middleware(
    CORSMiddleware,
    allow_origins=TRUSTED_ORIGINS if not settings.DEBUG else ["*"],
    allow_credentials=True if not settings.DEBUG else False,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(firm_os_router)
api_router.include_router(gates_router)
api_router.include_router(documents_router)
api_router.include_router(returns_router, dependencies=[Depends(require_role("ARTICLE_TRAINEE"))])
api_router.include_router(dashboard_router)
api_router.include_router(clients_router)
api_router.include_router(billing_router)
api_router.include_router(bank_reco_router)
api_router.include_router(auth_router)
api_router.include_router(signing_router)
api_router.include_router(signer_devices_router)

@api_router.get("/health")
async def health_check_v1():
    return {"status": "ok", "app": settings.APP_NAME, "version": "v1.1-firm-os"}

@api_router.post("/seed")
def seed_data(x_admin_key: Optional[str] = Header(None)):
    """Development seed. Disabled outright in production; there is no key-based bypass."""
    is_prod = os.getenv("ENVIRONMENT", "").lower() == "production" or not settings.DEBUG
    if is_prod:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found.")

    from .deterministic_core.seed_data import seed_database
    with AdminSessionLocal() as session:  # schema owner: seeding spans every tenant
        return seed_database(session)

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
