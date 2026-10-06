from pydantic_settings import BaseSettings
from typing import List, Optional

class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/ca_platform"
    REDIS_URL: str = "redis://localhost:6379/0"
    SECRET_KEY: str = "your-super-secret-key-change-in-production"
    APP_NAME: str = "CA Agentic Compliance Platform"
    DEBUG: bool = True
    CORS_ORIGINS: List[str] = ["*"]
    
    GSP_PRIMARY_URL: Optional[str] = None
    GSP_SECONDARY_URL: Optional[str] = None
    WABA_API_URL: Optional[str] = None
    WABA_TOKEN: Optional[str] = None
    
    class Config:
        env_file = ".env"

settings = Settings()
