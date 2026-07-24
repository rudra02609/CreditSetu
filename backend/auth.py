"""
auth.py - Email/password hashing and JWT helpers for BharatScore.
"""
import os
from datetime import datetime, timedelta
from typing import Optional

from dotenv import load_dotenv
from passlib.context import CryptContext

_ENV_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
load_dotenv(_ENV_FILE, override=True)

JWT_SECRET_KEY = (os.getenv("JWT_SECRET_KEY") or "bharatscore_default_secret").strip()
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    """Hash a plaintext password with bcrypt."""
    # bcrypt only uses the first 72 bytes
    return pwd_context.hash(password[:72])


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plaintext password against a bcrypt hash."""
    try:
        return pwd_context.verify(plain_password[:72], hashed_password)
    except Exception as exc:
        print(f"[auth] Password verify failed: {exc}")
        return False


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create a signed JWT that embeds the supplied data."""
    import jwt  # PyJWT

    to_encode = data.copy()
    expire = datetime.utcnow() + (
        expires_delta if expires_delta else timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> Optional[dict]:
    """Decode and verify a JWT. Returns the payload or None."""
    import jwt  # PyJWT

    try:
        return jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
    except Exception as exc:
        print(f"[auth] JWT decode failed: {exc}")
        return None
