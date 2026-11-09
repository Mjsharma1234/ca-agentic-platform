from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List, Optional

INSECURE_DEFAULT_SECRET = "your-super-secret-key-change-in-production"

class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite+aiosqlite:///./ca_platform.db"
    # Schema owner connection used only by Alembic. When unset, migrations use DATABASE_URL.
    DATABASE_ADMIN_URL: Optional[str] = None
    # PostgreSQL row-level security: the API does SET ROLE to this non-owner, non-BYPASSRLS role on every
    # pooled connection (created by migration 0006 as `ca_app`). Required in production on PostgreSQL.
    DB_APP_ROLE: Optional[str] = None
    DB_POOL_SIZE: int = 10
    DB_MAX_OVERFLOW: int = 10
    DB_POOL_RECYCLE_SECONDS: int = 1800
    DB_STATEMENT_TIMEOUT_MS: int = 30000
    DB_LOCK_TIMEOUT_MS: int = 10000
    DB_IDLE_IN_TX_TIMEOUT_MS: int = 60000
    POSTGRES_URL: Optional[str] = "postgresql+asyncpg://postgres:postgres@localhost:5432/ca_platform"
    USE_SQLITE_FALLBACK: bool = True
    REDIS_URL: str = "redis://localhost:6379/0"
    SECRET_KEY: str = INSECURE_DEFAULT_SECRET
    # Schema is owned by Alembic outside local development. When None, tables are only
    # auto-created in DEBUG mode (SQLite dev loop); production must run `alembic upgrade head`.
    AUTO_CREATE_TABLES: Optional[bool] = None
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480
    SIGNING_REQUEST_TTL_SECONDS: int = 300
    # DSC trust & revocation (see app/deterministic_core/dsc_revocation.py)
    DSC_TRUSTED_CA_PEM_PATH: Optional[str] = None
    DSC_TRUSTED_CA_PEM: Optional[str] = None   # inline PEM alternative to the path (handy for PaaS env vars)
    DSC_REVOCATION_MODE: str = "soft"          # off | soft | strict
    DSC_CRL_CACHE_SECONDS: int = 3600
    DSC_OCSP_ENABLED: bool = True              # try OCSP first, fall back to the CRL
    DSC_OCSP_CACHE_SECONDS: int = 300
    # Desktop signer device grant
    SIGNER_ACCESS_TOKEN_MINUTES: int = 15
    SIGNER_REFRESH_DAYS: int = 30
    DEVICE_CODE_TTL_SECONDS: int = 600
    PUBLIC_WEB_URL: str = "http://localhost:3000"
    # Public base URL of this API as the signer sees it (scheme+host, no path). DPoP proofs are bound
    # to it, so it must be set behind a TLS-terminating proxy; when unset the request URL is used.
    PUBLIC_API_URL: Optional[str] = None
    SIGNER_REQUIRE_DPOP: bool = True           # RFC 9449 sender-constrained signer tokens
    # Optional Redis URL shared by all workers for rate limits and DPoP replay protection.
    # Unset (or unreachable) => per-process in-memory fallback.
    SHARED_STORE_URL: Optional[str] = None
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
        if self.DSC_REVOCATION_MODE not in ("off", "soft", "strict"):
            raise ValueError("DSC_REVOCATION_MODE must be off, soft or strict.")
        if not self.DEBUG:
            if self.SECRET_KEY == INSECURE_DEFAULT_SECRET or len(self.SECRET_KEY) < 32:
                raise ValueError(
                    "SECRET_KEY must be set to a random value of at least 32 characters when DEBUG is false."
                )
            if self.OTP_SANDBOX_MODE:
                raise ValueError(
                    "OTP_SANDBOX_MODE must be false when DEBUG is false: sandbox mode returns OTPs in API responses."
                )
            self._require_dsc_trust_anchor()
            if self.DATABASE_URL.startswith(("postgres://", "postgresql")) and not self.DB_APP_ROLE:
                raise ValueError(
                    "DB_APP_ROLE must be set (to `ca_app`) when DEBUG is false on PostgreSQL: without it the API "
                    "connects as a role that bypasses row-level security."
                )
            if self.DSC_REVOCATION_MODE == "off":
                raise ValueError("DSC_REVOCATION_MODE must be soft or strict when DEBUG is false.")
            if not self.PUBLIC_WEB_URL.lower().startswith("https://"):
                raise ValueError("PUBLIC_WEB_URL must be an https:// URL when DEBUG is false.")
            if self.SIGNER_REQUIRE_DPOP and not (self.PUBLIC_API_URL or "").lower().startswith("https://"):
                raise ValueError(
                    "PUBLIC_API_URL must be the public https:// URL of this API when DEBUG is false "
                    "(signer DPoP proofs are bound to it). Set SIGNER_REQUIRE_DPOP=false only to disable DPoP."
                )
        return self

    def _require_dsc_trust_anchor(self) -> None:
        """Production must verify DSC issuers and CRL/OCSP signatures; refuse to boot without a usable anchor."""
        from ..deterministic_core.dsc_trust import TrustAnchorError, read_trust_anchor

        try:
            read_trust_anchor(self.DSC_TRUSTED_CA_PEM_PATH, self.DSC_TRUSTED_CA_PEM)
        except TrustAnchorError as exc:
            raise ValueError(f"DSC trust anchor is required when DEBUG is false: {exc}") from exc

    @property
    def auto_create_tables(self) -> bool:
        if self.AUTO_CREATE_TABLES is not None:
            return self.AUTO_CREATE_TABLES
        return bool(self.DEBUG)

settings = Settings()
