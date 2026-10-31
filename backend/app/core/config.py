from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List, Optional

class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite+aiosqlite:///./ca_platform.db"
    POSTGRES_URL: Optional[str] = "postgresql+asyncpg://postgres:postgres@localhost:5432/ca_platform"
    USE_SQLITE_FALLBACK: bool = True
    REDIS_URL: str = "redis://localhost:6379/0"
    SECRET_KEY: str = "your-super-secret-key-change-in-production"
    APP_NAME: str = "CA Agentic Compliance Platform"
    DEBUG: bool = True
    CORS_ORIGINS: List[str] = ["*"]
    
    GSP_PRIMARY_URL: Optional[str] = None
    GSP_SECONDARY_URL: Optional[str] = None
    WABA_API_URL: Optional[str] = None
    WABA_TOKEN: Optional[str] = None
    
    # OTP & Communication Settings (Fast2SMS / Twilio / Resend / SMTP)
    FAST2SMS_API_KEY: Optional[str] = None
    TWILIO_ACCOUNT_SID: Optional[str] = None
    TWILIO_AUTH_TOKEN: Optional[str] = None
    TWILIO_FROM_NUMBER: Optional[str] = None
    RESEND_API_KEY: Optional[str] = None
    SMTP_HOST: Optional[str] = None
    SMTP_PORT: int = 587
    SMTP_USER: Optional[str] = None
    SMTP_PASSWORD: Optional[str] = None
    SMTP_FROM_EMAIL: str = "noreply@ca-platform.local"
    OTP_EXPIRE_MINUTES: int = 5
    OTP_SANDBOX_MODE: bool = True
    
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()
