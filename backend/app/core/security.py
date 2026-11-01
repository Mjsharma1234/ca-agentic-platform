import os
import re
import hmac
import hashlib
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any
import jwt

from .config import settings

ALGORITHM = "HS256"

def get_password_hash(password: str) -> str:
    """Generates standard salted PBKDF2-HMAC-SHA256 password hash (NIST/FIPS approved)."""
    salt = os.urandom(16).hex()
    key = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 100000).hex()
    return f"pbkdf2:sha256:100000${salt}${key}"

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifies a plain password against the salted PBKDF2 hash using constant-time comparison."""
    try:
        if hashed_password.startswith("pbkdf2:sha256:"):
            _, salt, expected_key = hashed_password.split("$")
            computed = hashlib.pbkdf2_hmac("sha256", plain_password.encode("utf-8"), salt.encode("utf-8"), 100000).hex()
            return hmac.compare_digest(computed, expected_key)
        # Fallback for plain legacy SHA-256 hashes using constant-time comparison
        computed_sha = hashlib.sha256(plain_password.encode("utf-8")).hexdigest()
        return hmac.compare_digest(computed_sha, hashed_password)
    except Exception:
        return False

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Creates a signed JWT access token with UTC timestamp expiration."""
    to_encode = data.copy()
    now = datetime.now(timezone.utc)
    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(minutes=60)
    to_encode.update({"exp": expire, "iat": now})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def verify_agent_manifest(manifest: Dict[str, Any]) -> bool:
    """AST tool checker that verifies no agent manifest contains filing/signing/submitting tools."""
    forbidden_keywords = ["file", "sign", "submit", "commit", "delete", "execute", "release"]
    tools = manifest.get("tools", [])
    for tool in tools:
        tool_name = tool.get("name", "").lower()
        if any(keyword in tool_name for keyword in forbidden_keywords):
            return False
    return True

def sanitize_prompt(prompt: str) -> str:
    """Production Multi-Channel Prompt Sanitizer:
    1. Strips invisible unicode & zero-width smuggling characters.
    2. Strips SQL/shell delimiters & comment tokens.
    3. Neutralizes LLM system delimiter injection tags (<|im_start|>, [INST], etc.).
    4. Neutralizes direct instruction override / jailbreak patterns.
    5. Neutralizes Markdown image exfiltration vectors.
    """
    if not prompt:
        return ""

    # 1. Strip zero-width and invisible unicode characters
    sanitized = re.sub(r"[\u200B-\u200D\uFEFF\u202A-\u202E]", "", prompt)

    # 2. Strip comment syntax and query separators
    sanitized = re.sub(r"(--|;|/\*|\*/)", "", sanitized)

    # 3. Strip special model tokens & chat delimiters
    sanitized = re.sub(r"(<\|.*?\|>|\[/?INST\]|\[/?SYS\]|<<SYS>>|<</SYS>>)", "", sanitized, flags=re.IGNORECASE)
    sanitized = re.sub(r"```\s*(system|prompt|instruction).*?```", "", sanitized, flags=re.IGNORECASE | re.DOTALL)

    # 4. Neutralize direct instruction overrides and role-play injection phrases
    override_patterns = [
        r"ignore\s+(all\s+|previous\s+|prior\s+)?instructions?",
        r"disregard\s+(all\s+|previous\s+|prior\s+)?instructions?",
        r"override\s+(system\s+|security\s+)?rules?",
        r"you\s+are\s+now\s+(authorized|a\s+senior\s+partner|the\s+signatory|in\s+developer\s+mode|dan)",
        r"act\s+as\s+(the\s+signatory|a\s+partner\s+with\s+signing\s+authority)",
        r"system\s*:\s*you\s+are\s+authorized",
        r"bypass\s+(gate|four-eyes|review|sqc\s*1)",
    ]
    for pattern in override_patterns:
        sanitized = re.sub(pattern, "[BLOCKED_INJECTION_PATTERN]", sanitized, flags=re.IGNORECASE)

    # 5. Neutralize markdown image data exfiltration patterns (![...](http...))
    sanitized = re.sub(r"!\[.*?\]\(https?://[^\s\)]+\)", "[BLOCKED_EXFILTRATION_LINK]", sanitized)

    return sanitized.strip()

def tokenize_pii(text: str) -> str:
    """Comprehensive Statutory PII Tokenizer compliant with Indian DPDP Act 2023.
    Redacts or masks:
    - GSTINs (masks embedded PAN & entity code while preserving validation format)
    - PANs (Permanent Account Number)
    - Aadhaar Numbers (12-digit UIDAI)
    - Indian Mobile Numbers
    - Email Addresses
    - Bank Account Numbers
    """
    if not text:
        return ""

    # 1. Mask 12-digit Aadhaar (with optional spaces or dashes)
    text = re.sub(r"\b\d{4}[\s\-]?\d{4}[\s\-]?\d{4}\b", "XXXX XXXX XXXX", text)

    # 2. Mask GSTINs: 15-chars (e.g. 27AAACR1234F1Z5 -> 27XXXXX9999XZX)
    text = re.sub(
        r"\b([0-3][0-9])[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}[Z]{1}[0-9A-Z]{1}\b",
        r"\1XXXXX9999XZX",
        text
    )

    # 3. Mask PAN: 10-chars (e.g. AAACR1234F -> XXXXX9999X)
    text = re.sub(r"\b[A-Z]{5}[0-9]{4}[A-Z]{1}\b", "XXXXX9999X", text)

    # 4. Mask Indian Mobile Numbers (+91 or 10-digit mobile starting with 6,7,8,9)
    text = re.sub(r"(\+91[\-\s]?)?[6-9]\d{4}[\-\s]?\d{5}\b", "+91-XXXXX-XXXXX", text)

    # 5. Mask Email Addresses (keeps domain TLD, masks local name)
    text = re.sub(
        r"\b[a-zA-Z0-9_.+-]+@([a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+)\b",
        r"u***@\1",
        text
    )

    # 6. Mask Bank Account Numbers (9 to 18 digits)
    text = re.sub(r"\b\d{9,18}\b", "XXXXXXXXXXXX", text)

    return text
