from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List, Optional

INSECURE_DEFAULT_SECRET = "your-super-secret-key-change-in-production"

class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite+aiosqlite:///./ca_platform.db"
    POSTGRES_URL: Optional[str] = "postgresql+asyncpg://postgres:postgres@localhost:5432/ca_platform"
    USE_SQLITE_FALLBACK: bool = True
    REDIS_URL: str = "redis://localhost:6379/0"
    SECRET_KEY: str = INSECURE_DEFAULT_SECRET
    # Schema is owned by Alembic outside local development. When None, tables are only
    # auto-created in DEBUG mode (SQLite dev loop); production must run `alembic upgrade head`.
    AUTO_CREATE_TABLES: Optional[bool] = None
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480
    SIGNING_REQUEST_TTL_SECONDS: int = 300
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

    @model_validator(mode="after")
    def _fail_closed_in_production(self):
        if not self.DEBUG:
            if self.SECRET_KEY == INSECURE_DEFAULT_SECRET or len(self.SECRET_KEY) < 32:
                raise ValueError(
                    "SECRET_KEY must be set to a random value of at least 32 characters when DEBUG is false."
                )
            if self.OTP_SANDBOX_MODE:
                raise ValueError(
                    "OTP_SANDBOX_MODE must be false when DEBUG is false: sandbox mode returns OTPs in API responses."
                )
        return self

    @property
    def auto_create_tables(self) -> bool:
        if self.AUTO_CREATE_TABLES is not None:
            return self.AUTO_CREATE_TABLES
        return bool(self.DEBUG)

settings = Settings()
