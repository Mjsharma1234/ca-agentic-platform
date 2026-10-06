import re
from passlib.context import CryptContext
from jose import JWTError, jwt
from datetime import datetime, timedelta
from typing import Optional, Dict, Any

from .config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

ALGORITHM = "HS256"

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def verify_agent_manifest(manifest: Dict[str, Any]) -> bool:
    """AST tool checker that verifies no agent manifest contains filing/signing/submitting tools."""
    forbidden_keywords = ["file", "sign", "submit", "commit"]
    tools = manifest.get("tools", [])
    for tool in tools:
        tool_name = tool.get("name", "").lower()
        if any(keyword in tool_name for keyword in forbidden_keywords):
            return False
    return True

def sanitize_prompt(prompt: str) -> str:
    """3-channel prompt sanitizer (strips injection attempts, delimiter attacks)."""
    # Simple simulation of a sanitizer
    sanitized = re.sub(r"(--|;|/\*|\*/)", "", prompt)
    sanitized = re.sub(r"(<\|.*?\|>)", "", sanitized) # Remove special delimiters
    return sanitized

def tokenize_pii(text: str) -> str:
    """PII tokenizer for PAN, Aadhaar, bank account masking."""
    # Mask PAN
    text = re.sub(r'[A-Z]{5}[0-9]{4}[A-Z]{1}', 'XXXXX9999X', text)
    # Mask Aadhaar
    text = re.sub(r'\d{4}\s?\d{4}\s?\d{4}', 'XXXX XXXX XXXX', text)
    # Mask Bank Account
    text = re.sub(r'\b\d{9,18}\b', 'XXXXXXXXXXXX', text)
    return text
