import re
import secrets
import hashlib
import logging
from datetime import datetime, timedelta, timezone
from typing import Tuple, Optional, Dict, Any
import httpx
from sqlalchemy.orm import Session
from sqlalchemy import select, and_, func

from ..core.config import settings
from ..models.otp import OTPRecord

logger = logging.getLogger("ca_platform.otp")
if not logger.handlers:
    logging.basicConfig(level=logging.INFO)

class OTPService:
    """Production Multi-Provider OTP Engine supporting:
    1. Indian Phone (+91) via Fast2SMS / Twilio
    2. Email via Resend / SMTP
    3. Zero-friction Console Sandbox mode for dev & automated testing
    """

    @staticmethod
    def normalize_identifier(identifier: str) -> Tuple[str, str]:
        """Normalizes email or phone number and identifies the communication channel."""
        clean = identifier.strip()
        
        # Check if email
        if "@" in clean:
            email_match = re.match(r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$", clean)
            if not email_match:
                raise ValueError("Invalid email address format.")
            return clean.lower(), "EMAIL"

        # Check if phone number
        digits = re.sub(r"\D", "", clean)
        if len(digits) == 10 and digits[0] in "6789":
            # Standard 10-digit Indian mobile
            return f"+91{digits}", "SMS"
        elif len(digits) == 12 and digits.startswith("91") and digits[2] in "6789":
            # 12-digit Indian mobile with 91 prefix
            return f"+{digits}", "SMS"
        elif clean.startswith("+") and 10 <= len(digits) <= 15:
            # International E.164
            return f"+{digits}", "SMS"
        else:
            raise ValueError("Invalid phone number. Please enter a valid 10-digit Indian mobile number.")

    @staticmethod
    def hash_otp(identifier: str, otp: str) -> str:
        """Computes HMAC-style SHA-256 hash using the platform SECRET_KEY."""
        salt = settings.SECRET_KEY
        return hashlib.sha256(f"{identifier}:{otp}:{salt}".encode("utf-8")).hexdigest()

    @classmethod
    def generate_and_send_otp(
        cls,
        db: Session,
        identifier: str,
        channel: Optional[str] = None,
        purpose: str = "LOGIN"
    ) -> Dict[str, Any]:
        """Generates a secure 6-digit OTP, saves record in DB, and dispatches via provider."""
        norm_id, detected_channel = cls.normalize_identifier(identifier)
        active_channel = channel or detected_channel

        now = datetime.now(timezone.utc)
        one_hour_ago = now - timedelta(hours=1)

        # Rate Limiting: Max 5 OTP requests per hour per identifier
        stmt = select(func.count(OTPRecord.id)).where(
            and_(
                OTPRecord.identifier == norm_id,
                OTPRecord.created_at >= one_hour_ago
            )
        )
        recent_count = db.execute(stmt).scalar() or 0
        if recent_count >= 5:
            raise ValueError("Too many OTP requests. For security, please wait an hour before trying again.")

        # Invalidate previous unverified OTPs for this identifier
        existing_result = db.execute(
            select(OTPRecord).where(
                and_(
                    OTPRecord.identifier == norm_id,
                    OTPRecord.is_verified == False
                )
            )
        )
        for prev in existing_result.scalars().all():
            prev.is_verified = True # Retire prior OTP

        # Generate 6-digit cryptographically random OTP
        plain_otp = f"{secrets.randbelow(900000) + 100000}"
        otp_hash = cls.hash_otp(norm_id, plain_otp)
        expires_at = now + timedelta(minutes=settings.OTP_EXPIRE_MINUTES)

        record = OTPRecord(
            identifier=norm_id,
            otp_hash=otp_hash,
            channel=active_channel,
            purpose=purpose,
            attempts=0,
            max_attempts=3,
            is_verified=False,
            expires_at=expires_at,
            created_at=now
        )
        db.add(record)
        db.commit()
        db.refresh(record)

        # Dispatch via real provider
        dispatch_status = cls._dispatch_otp(norm_id, plain_otp, active_channel)

        resp: Dict[str, Any] = {
            "status": "sent",
            "identifier": norm_id,
            "channel": active_channel,
            "provider": dispatch_status.get("provider", "sandbox"),
            "expires_in_seconds": settings.OTP_EXPIRE_MINUTES * 60,
        }

        # Include dev_otp in response when in debug or sandbox mode for zero-friction local testing
        if settings.DEBUG or settings.OTP_SANDBOX_MODE or dispatch_status.get("sandbox"):
            resp["dev_otp"] = plain_otp

        return resp

    @classmethod
    def verify_otp(
        cls,
        db: Session,
        identifier: str,
        candidate_otp: str
    ) -> Tuple[bool, str]:
        """Verifies candidate OTP against the stored SHA-256 hash."""
        norm_id, _ = cls.normalize_identifier(identifier)
        clean_otp = candidate_otp.strip()

        now = datetime.now(timezone.utc)

        result = db.execute(
            select(OTPRecord)
            .where(
                and_(
                    OTPRecord.identifier == norm_id,
                    OTPRecord.is_verified == False,
                    OTPRecord.expires_at > now
                )
            )
            .order_by(OTPRecord.created_at.desc())
        )
        record = result.scalars().first()

        if not record:
            return False, "OTP has expired or is invalid. Please request a new OTP."

        if record.attempts >= record.max_attempts:
            return False, "Maximum verification attempts exceeded. Please request a new OTP."

        record.attempts += 1
        expected_hash = cls.hash_otp(norm_id, clean_otp)

        if record.otp_hash != expected_hash:
            remaining = record.max_attempts - record.attempts
            db.commit()
            if remaining <= 0:
                return False, "Maximum verification attempts exceeded. Please request a new OTP."
            return False, f"Incorrect OTP. {remaining} attempt(s) remaining."

        # Mark as verified and consumed
        record.is_verified = True
        db.commit()
        return True, "OTP verified successfully."

    # -------------------------------------------------------------
    # Provider Dispatch Adapters
    # -------------------------------------------------------------
    @classmethod
    def _dispatch_otp(cls, identifier: str, otp: str, channel: str) -> Dict[str, Any]:
        """Dispatches OTP using configured third-party providers with fallback to sandbox logger."""
        # 1. SMS Channel
        if channel == "SMS":
            # Option A: Fast2SMS (Indian direct gateway)
            if settings.FAST2SMS_API_KEY:
                try:
                    clean_phone = identifier.replace("+91", "").replace("+", "")
                    with httpx.Client(timeout=8.0) as client:
                        response = client.post(
                            "https://www.fast2sms.com/dev/bulkV2",
                            headers={"authorization": settings.FAST2SMS_API_KEY},
                            data={
                                "variables_values": otp,
                                "route": "otp",
                                "numbers": clean_phone,
                            }
                        )
                        if response.status_code == 200 and response.json().get("return"):
                            logger.info(f"[Fast2SMS] Successfully sent OTP to {identifier}")
                            return {"provider": "fast2sms", "status": "delivered"}
                        else:
                            logger.warning(f"[Fast2SMS] Failed response: {response.text}")
                except Exception as e:
                    logger.error(f"[Fast2SMS] Dispatch exception: {e}")

            # Option B: Twilio
            if settings.TWILIO_ACCOUNT_SID and settings.TWILIO_AUTH_TOKEN and settings.TWILIO_FROM_NUMBER:
                try:
                    url = f"https://api.twilio.com/2010-04-01/Accounts/{settings.TWILIO_ACCOUNT_SID}/Messages.json"
                    with httpx.Client(timeout=8.0) as client:
                        response = client.post(
                            url,
                            auth=(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN),
                            data={
                                "To": identifier,
                                "From": settings.TWILIO_FROM_NUMBER,
                                "Body": f"Your CA Agentic Platform security verification code is: {otp}. Valid for 5 minutes. Do not share."
                            }
                        )
                        if response.status_code in (200, 201):
                            logger.info(f"[Twilio] Successfully sent OTP to {identifier}")
                            return {"provider": "twilio", "status": "delivered"}
                        else:
                            logger.warning(f"[Twilio] Failed response: {response.text}")
                except Exception as e:
                    logger.error(f"[Twilio] Dispatch exception: {e}")

        # 2. Email Channel
        elif channel == "EMAIL":
            # Option A: Resend REST API (3,000 free emails/mo)
            if settings.RESEND_API_KEY:
                try:
                    with httpx.Client(timeout=8.0) as client:
                        response = client.post(
                            "https://api.resend.com/emails",
                            headers={
                                "Authorization": f"Bearer {settings.RESEND_API_KEY}",
                                "Content-Type": "application/json"
                            },
                            json={
                                "from": settings.SMTP_FROM_EMAIL or "auth@ca-platform.local",
                                "to": [identifier],
                                "subject": f"Your Security OTP: {otp} - CA Agentic Platform",
                                "html": f"""
                                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px;">
                                    <h2 style="color: #0f172a; margin-top: 0;">CA Agentic Compliance Platform</h2>
                                    <p style="color: #475569; font-size: 15px;">Your one-time authentication passcode for signing in is:</p>
                                    <div style="background-color: #f1f5f9; border-radius: 8px; padding: 16px; text-align: center; margin: 24px 0;">
                                        <span style="font-size: 32px; font-weight: 700; letter-spacing: 6px; color: #0284c7;">{otp}</span>
                                    </div>
                                    <p style="color: #64748b; font-size: 13px;">This OTP will expire in 5 minutes. ICAI SQC 1 Compliance: Never share your login credentials with anyone.</p>
                                </div>
                                """
                            }
                        )
                        if response.status_code in (200, 201):
                            logger.info(f"[Resend] Successfully sent OTP to {identifier}")
                            return {"provider": "resend", "status": "delivered"}
                        else:
                            logger.warning(f"[Resend] Failed response: {response.text}")
                except Exception as e:
                    logger.error(f"[Resend] Dispatch exception: {e}")

            # Option B: Standard SMTP (Gmail / Zoho / Outlook)
            if settings.SMTP_HOST and settings.SMTP_USER and settings.SMTP_PASSWORD:
                try:
                    import smtplib
                    from email.mime.text import MIMEText
                    from email.mime.multipart import MIMEMultipart

                    msg = MIMEMultipart("alternative")
                    msg["Subject"] = f"Your Login OTP: {otp} - CA Platform"
                    msg["From"] = settings.SMTP_FROM_EMAIL or settings.SMTP_USER
                    msg["To"] = identifier

                    text_content = f"Your login verification OTP is: {otp}. Valid for 5 minutes."
                    msg.attach(MIMEText(text_content, "plain"))

                    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
                        server.starttls()
                        server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                        server.sendmail(msg["From"], [identifier], msg.as_string())

                    logger.info(f"[SMTP] Successfully sent OTP email to {identifier}")
                    return {"provider": "smtp", "status": "delivered"}
                except Exception as e:
                    logger.error(f"[SMTP] Dispatch exception: {e}")

        # 3. Sandbox Logger Fallback (Development & Automated Testing)
        logger.info(f"============================================================")
        logger.info(f" [OTP-SANDBOX] Recipient: {identifier} ({channel})")
        logger.info(f" [OTP-SANDBOX] One-Time Passcode: >>> {otp} <<< (5 min TTL)")
        logger.info(f"============================================================")
        return {"provider": "sandbox", "sandbox": True, "status": "delivered_to_console"}
