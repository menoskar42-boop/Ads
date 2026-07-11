"""SQLAlchemy engine and session factory.

The engine is configured for cloud Postgres (Replit / Neon / Supabase).
Those providers silently drop idle SSL connections; pool_pre_ping
validates each leased connection with a cheap SELECT 1, and
pool_recycle rotates connections older than the typical idle timeout.
"""
import os

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

DATABASE_URL = os.environ["DATABASE_URL"]

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_recycle=300,
    future=True,
)

SessionLocal = sessionmaker(
    bind=engine,
    autocommit=False,
    autoflush=False,
    expire_on_commit=False,
    future=True,
)

Base = declarative_base()


def init_db() -> None:
    """Create tables if they don't exist. Safe to call repeatedly.

    Also runs idempotent ALTER TABLE statements for columns that were
    added after the original schema shipped. Postgres' IF NOT EXISTS
    semantics make these no-ops once the column is in place.
    """
    # Import inside the function so models.py can reference Base
    # without forcing a circular import at module load time.
    from models import AnalysisResult, CTSlice, CTStudy  # noqa: F401

    Base.metadata.create_all(bind=engine)

    # Lightweight migrations for previously-deployed schemas
    from sqlalchemy import text

    _migrations = [
        "ALTER TABLE studies ADD COLUMN IF NOT EXISTS laterality VARCHAR(8) DEFAULT ''",
        "ALTER TABLE studies ADD COLUMN IF NOT EXISTS clinical_context TEXT",
    ]
    with engine.begin() as conn:
        for sql in _migrations:
            try:
                conn.execute(text(sql))
            except Exception:
                # Older Postgres versions or non-Postgres backends may
                # not support IF NOT EXISTS; swallow and continue —
                # create_all above will have handled fresh databases.
                pass
