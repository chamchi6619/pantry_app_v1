"""Authentication and authorization utilities."""
import os
import uuid
from datetime import datetime, timedelta
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession
from dotenv import load_dotenv

from .database import get_db
from .schemas import TokenData, UserResponse

load_dotenv()

# Configuration
SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-key-change-in-production")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))
REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "7"))

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# OAuth2 scheme
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash."""
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """Hash a password."""
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create a JWT access token."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)

    to_encode.update({"exp": expire, "type": "access"})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def create_refresh_token(data: dict) -> tuple[str, datetime]:
    """Create a JWT refresh token and return token with expiry."""
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)

    to_encode.update({"exp": expire, "type": "refresh"})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt, expire


def decode_token(token: str) -> Optional[str]:
    """Decode and verify a JWT token."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            return None
        return user_id
    except JWTError:
        return None


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db)
) -> dict:
    """Get current authenticated user from token."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    user_id = decode_token(token)
    if user_id is None:
        raise credentials_exception

    # Get user from database
    query = text("""
        SELECT id, email, username, household_id, created_at
        FROM users
        WHERE id = :user_id
    """)
    result = await db.execute(query, {"user_id": user_id})
    user = result.first()

    if user is None:
        raise credentials_exception

    return {
        "id": user.id,
        "email": user.email,
        "username": user.username,
        "household_id": user.household_id,
        "created_at": user.created_at
    }


async def create_user(
    email: str,
    password: str,
    username: Optional[str],
    household_name: Optional[str],
    db: AsyncSession
) -> dict:
    """Create a new user and household."""
    # Check if user exists
    query = text("SELECT id FROM users WHERE email = :email")
    result = await db.execute(query, {"email": email})
    if result.first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )

    # Create household
    household_id = str(uuid.uuid4())
    household_name = household_name or f"{email.split('@')[0]}'s Household"

    await db.execute(
        text("INSERT INTO households (id, name) VALUES (:id, :name)"),
        {"id": household_id, "name": household_name}
    )

    # Create user
    user_id = str(uuid.uuid4())
    password_hash = get_password_hash(password)

    await db.execute(
        text("""
            INSERT INTO users (id, email, username, password_hash, household_id)
            VALUES (:id, :email, :username, :password_hash, :household_id)
        """),
        {
            "id": user_id,
            "email": email,
            "username": username,
            "password_hash": password_hash,
            "household_id": household_id
        }
    )

    await db.commit()

    return {
        "id": user_id,
        "email": email,
        "username": username,
        "household_id": household_id,
        "created_at": datetime.utcnow()
    }


async def authenticate_user(email: str, password: str, db: AsyncSession) -> Optional[dict]:
    """Authenticate a user by email and password."""
    query = text("""
        SELECT id, email, username, password_hash, household_id, created_at
        FROM users
        WHERE email = :email
    """)
    result = await db.execute(query, {"email": email})
    user = result.first()

    if not user:
        return None

    if not verify_password(password, user.password_hash):
        return None

    return {
        "id": user.id,
        "email": user.email,
        "username": user.username,
        "household_id": user.household_id,
        "created_at": user.created_at
    }


async def save_refresh_token(user_id: str, token: str, expires_at: datetime, db: AsyncSession):
    """Save refresh token to database."""
    token_id = str(uuid.uuid4())
    await db.execute(
        text("""
            INSERT INTO refresh_tokens (id, user_id, token, expires_at)
            VALUES (:id, :user_id, :token, :expires_at)
        """),
        {
            "id": token_id,
            "user_id": user_id,
            "token": token,
            "expires_at": expires_at
        }
    )
    await db.commit()


async def verify_refresh_token(token: str, db: AsyncSession) -> Optional[str]:
    """Verify refresh token and return user_id if valid."""
    query = text("""
        SELECT user_id, expires_at
        FROM refresh_tokens
        WHERE token = :token
    """)
    result = await db.execute(query, {"token": token})
    token_data = result.first()

    if not token_data:
        return None

    if token_data.expires_at < datetime.utcnow():
        # Token expired, delete it
        await db.execute(
            text("DELETE FROM refresh_tokens WHERE token = :token"),
            {"token": token}
        )
        await db.commit()
        return None

    return token_data.user_id