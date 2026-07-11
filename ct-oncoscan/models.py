"""ORM models for the imaging platform.

Design note: `CTSlice.dicom_bytes` stores the *original* DICOM file
bytes — not a decoded float32 array. Storing the originals keeps
ingestion memory near zero (we just stream the file in and write it),
preserves transfer syntax and full DICOM headers, and lets the viewer
decode on demand with the appropriate codec.
"""
from datetime import datetime

from sqlalchemy import (
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    JSON,
    LargeBinary,
    String,
    Text,
)
from sqlalchemy.orm import relationship

from database import Base


class CTStudy(Base):
    """A radiology study (CT or MRI), one row per uploaded series."""

    __tablename__ = "studies"

    id = Column(Integer, primary_key=True)
    patient_id = Column(String(100), index=True)
    study_date = Column(DateTime)
    study_description = Column(String(500))
    modality = Column(String(16), default="CT", nullable=False)
    # Doctor-specified side override ('R' / 'L' / ''). Falls back to the
    # cross-series inference when empty.
    laterality = Column(String(8), default="", nullable=False)
    num_slices = Column(Integer, default=0, nullable=False)
    image_dimensions = Column(String(32))
    pixel_spacing = Column(String(64))
    slice_thickness = Column(Float)
    upload_date = Column(DateTime, default=datetime.utcnow, nullable=False)
    status = Column(String(16), default="uploaded", nullable=False)
    # Free-text clinical history: age, sex, chief complaint, mechanism of
    # injury, prior imaging, labs. Injected into the AI prompt so the
    # report reads with the same context a real consultant has.
    clinical_context = Column(Text)
    notes = Column(Text)

    slices = relationship(
        "CTSlice",
        back_populates="study",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    analyses = relationship(
        "AnalysisResult",
        back_populates="study",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class CTSlice(Base):
    """A single DICOM file belonging to a study."""

    __tablename__ = "slices"

    id = Column(Integer, primary_key=True)
    study_id = Column(
        Integer,
        ForeignKey("studies.id", ondelete="CASCADE"),
        nullable=False,
    )
    slice_index = Column(Integer, nullable=False)
    instance_number = Column(Integer)
    slice_location = Column(Float)
    sop_instance_uid = Column(String(128))
    rows = Column(Integer)
    columns = Column(Integer)
    dicom_bytes = Column(LargeBinary, nullable=False)
    extra = Column(JSON)

    study = relationship("CTStudy", back_populates="slices")

    __table_args__ = (
        Index("ix_slices_study_order", "study_id", "slice_index"),
    )


class AnalysisResult(Base):
    """One AI analysis pass over a study."""

    __tablename__ = "analyses"

    id = Column(Integer, primary_key=True)
    study_id = Column(
        Integer,
        ForeignKey("studies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    model_name = Column(String(64))
    analysis_focus = Column(String(128))
    custom_task = Column(Text)
    report = Column(Text)

    study = relationship("CTStudy", back_populates="analyses")
