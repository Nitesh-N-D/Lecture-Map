import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Boolean, Enum as SAEnum
from sqlalchemy.orm import relationship
from app.database import Base
import enum


class UserRole(str, enum.Enum):
    USER = "user"
    GUEST = "guest"
    ADMIN = "admin"


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String, unique=True, nullable=True, index=True)
    hashed_password = Column(String, nullable=True)  # null for Google-only or guest accounts
    name = Column(String, nullable=True)
    avatar_url = Column(String, nullable=True)
    google_id = Column(String, unique=True, nullable=True, index=True)
    role = Column(
    SAEnum(
        UserRole,
        values_callable=lambda obj: [e.value for e in obj],
    ),
    default=UserRole.USER,
    nullable=False,
    )
    is_guest = Column(Boolean, default=False, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    lectures = relationship("Lecture", back_populates="user", cascade="all, delete-orphan")
    study_sessions = relationship("StudySession", back_populates="user", cascade="all, delete-orphan")

    @property
    def has_password(self) -> bool:
        """
        Exposed via UserResponse instead of the hash itself, so the
        frontend can tell whether an account can use email/password login
        (vs. Google-only or guest) without ever seeing hashed_password.
        """
        return bool(self.hashed_password)
