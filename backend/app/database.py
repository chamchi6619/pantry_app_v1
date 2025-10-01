"""Database configuration and session management."""
import os
import sqlite3
from pathlib import Path
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import declarative_base
from sqlalchemy import event, text
from dotenv import load_dotenv

load_dotenv()

# Database URL
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./data/pantry.db")

# Create database directory if it doesn't exist
db_path = Path("./data")
db_path.mkdir(exist_ok=True)

# Create async engine
engine = create_async_engine(
    DATABASE_URL,
    echo=False,  # Set to True for SQL query logging
    future=True,
    connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {},
)

# Create async session factory
async_session_maker = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

# Base class for models
Base = declarative_base()


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependency to get database session."""
    async with async_session_maker() as session:
        try:
            yield session
        finally:
            await session.close()


async def init_db():
    """Initialize database with schema."""
    # Read and execute schema
    schema_path = Path("migrations/sqlite_schema.sql")
    if schema_path.exists():
        async with engine.begin() as conn:
            with open(schema_path, "r") as f:
                schema_sql = f.read()
                # Split by semicolon and execute each statement
                statements = [s.strip() for s in schema_sql.split(";") if s.strip()]
                for statement in statements:
                    if statement and not statement.strip().startswith('--'):
                        try:
                            await conn.execute(text(statement + ";"))
                        except Exception as e:
                            # Skip if statement is incomplete or causes error
                            if "incomplete input" not in str(e):
                                print(f"Warning: Error executing statement: {e}")

            # Verify FTS5 support
            result = await conn.execute(
                text("SELECT sqlite_compileoption_used('ENABLE_FTS5') as fts5_enabled")
            )
            fts5_enabled = result.scalar()
            if not fts5_enabled:
                print("WARNING: SQLite FTS5 not available. Search functionality will be limited.")
            else:
                print("✓ SQLite FTS5 support confirmed")

    print("✓ Database initialized")


async def verify_fts5() -> bool:
    """Verify FTS5 is available."""
    async with engine.begin() as conn:
        result = await conn.execute(
            text("SELECT sqlite_compileoption_used('ENABLE_FTS5') as fts5_enabled")
        )
        return bool(result.scalar())


async def get_db_stats() -> dict:
    """Get database statistics for monitoring."""
    async with engine.begin() as conn:
        stats = {}

        # Get table counts
        tables = ["recipes", "ingredients", "users", "households", "receipts"]
        for table in tables:
            result = await conn.execute(text(f"SELECT COUNT(*) FROM {table}"))
            stats[f"{table}_count"] = result.scalar() or 0

        # Get database size
        result = await conn.execute(text("SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()"))
        stats["db_size_bytes"] = result.scalar() or 0

        return stats