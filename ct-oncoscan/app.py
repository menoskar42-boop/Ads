"""منصة تحليل الأشعة الطبية / Medical Imaging Analysis Platform.

Streamlit single-process app. Every page reads/writes its own DB
session; the cross-page contract is `st.session_state.selected_study_id`
which points at the currently chosen study, plus an in-memory volume
cache keyed by the same id.
"""
from __future__ import annotations

import gc
import logging
import logging.handlers
import os
import time
from collections import Counter
from datetime import datetime

import numpy as np
import streamlit as st
from sqlalchemy import func

from database import SessionLocal, init_db
from dicom_io import (
    decode_slice,
    discover_dicom_files,
    inventory_series,
    read_dicom_metadata,
)
from dicom_viewer import render_dicom_viewer
from models import AnalysisResult, CTSlice, CTStudy
from openai_client import (
    AI_MODEL,
    MAX_SAMPLE_SLICES,
    chat_about_study,
    compute_cost_usd,
    credentials_status,
    produce_full_study_report,
    produce_report,
    synthesize_partial_reports,
)

# ── Persistent debug log ─────────────────────────────────────────
# When the WebSocket drops mid-upload the doctor sees no error in the
# UI — but every breadcrumb still gets appended to ctos_debug.log on
# the server. The Settings page renders the tail so we can pinpoint
# exactly where a 598-slice upload stalled. Rotating handler caps
# the file at 2 MB × 3 backups.
LOG_FILE = os.environ.get("CT_LOG_FILE", "./ctos_debug.log")
_logger = logging.getLogger("ctos")
if not _logger.handlers:
    _logger.setLevel(logging.INFO)
    _handler = logging.handlers.RotatingFileHandler(
        LOG_FILE, maxBytes=2_000_000, backupCount=3, encoding="utf-8"
    )
    _handler.setFormatter(
        logging.Formatter("%(asctime)s [%(levelname)s] %(message)s")
    )
    _logger.addHandler(_handler)
    _logger.propagate = False


def log(msg: str, level: str = "info") -> None:
    """Append a breadcrumb to the debug log file and Streamlit's stdout."""
    getattr(_logger, level, _logger.info)(msg)


# Default USD → EGP rate. Override per-session from the Settings page.
# Picked to match the EGP's recent ~50 / dollar band; the doctor is
# expected to bump it whenever the official rate moves.
DEFAULT_USD_EGP_RATE = 50.0


def _usd_to_egp(usd: float) -> float:
    rate = float(st.session_state.get("usd_egp_rate", DEFAULT_USD_EGP_RATE))
    return usd * rate


def _format_cost(usage: dict) -> tuple[float, float]:
    """Return (usd, egp) for the given usage dict."""
    if not usage:
        return 0.0, 0.0
    cost = compute_cost_usd(usage)
    return cost["total_usd"], _usd_to_egp(cost["total_usd"])

# ──────────────────────────────────────────────────────────────────
# Bootstrap
# ──────────────────────────────────────────────────────────────────

st.set_page_config(
    page_title="منصة تحليل الأشعة الطبية",
    page_icon="🏥",
    layout="wide",
    initial_sidebar_state="expanded",
)


@st.cache_resource
def _bootstrap() -> bool:
    """Run schema creation exactly once per process."""
    init_db()
    return True


_bootstrap()


# ──────────────────────────────────────────────────────────────────
# Style
# ──────────────────────────────────────────────────────────────────

st.markdown(
    """
    <style>
        .main-header {
            background: linear-gradient(90deg,#1a5f7a 0%,#159895 100%);
            color: white; padding: 1rem 1.4rem; border-radius: 10px;
            margin-bottom: 1.2rem; text-align: center;
        }
        .pro-notice {
            background:#fff8e1; border:1px solid #ffd54f; border-radius:6px;
            padding:.7rem 1rem; margin-bottom:1rem;
        }
        .report-block {
            background:#f0f7ff; border-left:4px solid #0d6efd;
            border-radius:6px; padding:1rem; margin:.6rem 0;
            white-space: pre-wrap;
        }
        .chat-user {
            background:#e8f5e9; border-radius:8px; padding:.5rem 1rem;
            margin:.3rem 0;
        }
        .chat-ai {
            background:#f0f4ff; border-radius:8px; padding:.5rem 1rem;
            margin:.3rem 0; white-space: pre-wrap;
        }
    </style>
    """,
    unsafe_allow_html=True,
)


PAGES = [
    "🏠 الرئيسية",
    "📤 رفع دراسة جديدة",
    "🖥️ عارض الصور",
    "📊 الدراسات المحفوظة",
    "🔬 تحليل بالذكاء الاصطناعي",
    "💬 محادثة / Q&A",
    "⚙️ الإعدادات",
]


# ──────────────────────────────────────────────────────────────────
# Sidebar navigation
# ──────────────────────────────────────────────────────────────────

def _navigate():
    if "nav_radio" not in st.session_state:
        st.session_state.nav_radio = PAGES[0]

    # Honor a pending navigation request set by buttons elsewhere on
    # the page. Applied BEFORE the radio is instantiated, otherwise
    # mutating its session_state key would raise StreamlitAPIException.
    pending = st.session_state.pop("pending_nav", None)
    if pending in PAGES:
        st.session_state.nav_radio = pending

    st.sidebar.title("📋 القائمة الرئيسية")
    page = st.sidebar.radio("اختر الصفحة", PAGES, key="nav_radio")

    st.sidebar.markdown("---")
    st.sidebar.markdown("**الدراسة المختارة / Selected Study**")
    sid = st.session_state.get("selected_study_id")
    if sid:
        st.sidebar.success(f"📁 دراسة #{sid}")
        if st.sidebar.button("❌ إلغاء التحديد", key="clear_study"):
            _clear_study_state()
            st.rerun()
    else:
        st.sidebar.info("لم يتم اختيار دراسة")

    return page


def _clear_study_state() -> None:
    for k in (
        "selected_study_id",
        "loaded_volume",
        "loaded_modality",
        "loaded_pixel_spacing",
        "loaded_series",
        "chat_history",
        "chat_token_tally",
        "last_ai_report",
    ):
        st.session_state.pop(k, None)


# ──────────────────────────────────────────────────────────────────
# Heal phantom studies and load volumes
# ──────────────────────────────────────────────────────────────────

_LEGACY_REQUIRED_KEYS = (
    "series_description",
    "plane",
    "image_orientation",
    "body_part",
    "laterality",
    "protocol_name",
    "series_number",
)


def _enrich_legacy_metadata(db, study) -> bool:
    """Back-fill new metadata fields onto studies uploaded before the
    series-aware code existed.

    A pre-existing study has the original DICOM bytes stored in
    CTSlice.dicom_bytes but its `extra` JSON is missing series
    description, plane, body part, laterality, etc. Without these the
    series picker shows '(no description) — unknown' and the AI prompt
    falls back to CT-style wording.

    We re-read each slice's headers once (no pixel decode needed), merge
    the new fields into the existing JSON, and update CTStudy.modality
    if the DICOM disagrees with what the doctor originally typed.

    Returns True when an enrichment happened (caller may want to bust
    a cache). Idempotent: skips slices whose JSON already has the
    required keys.
    """
    first = (
        db.query(CTSlice)
        .filter(CTSlice.study_id == study.id)
        .order_by(CTSlice.slice_index)
        .first()
    )
    if not first or not first.dicom_bytes:
        return False
    existing = first.extra if isinstance(first.extra, dict) else {}
    if all(k in existing for k in _LEGACY_REQUIRED_KEYS):
        return False

    try:
        sample_meta = read_dicom_metadata(first.dicom_bytes)
    except Exception:
        return False

    # Reconcile modality with the DICOM source of truth
    dicom_modality = (sample_meta.get("modality") or "").strip()
    if dicom_modality and dicom_modality != study.modality:
        study.modality = dicom_modality

    slices = db.query(CTSlice).filter(CTSlice.study_id == study.id).all()
    for sl in slices:
        try:
            meta = read_dicom_metadata(sl.dicom_bytes)
        except Exception:
            continue
        merged = sl.extra if isinstance(sl.extra, dict) else {}
        merged.update(meta)
        sl.extra = merged

    # Also refresh study-level pixel spacing / thickness from DICOM if
    # they're missing
    if not study.pixel_spacing and sample_meta.get("pixel_spacing"):
        study.pixel_spacing = sample_meta["pixel_spacing"]
    if not study.slice_thickness:
        try:
            study.slice_thickness = float(sample_meta.get("slice_thickness") or 0) or None
        except (TypeError, ValueError):
            pass

    db.commit()
    return True


def _reconcile_studies(db) -> None:
    """Bring num_slices and status in line with actual slice counts.

    Repairs both directions:
      * status='processing' but slices landed → mark 'uploaded'.
      * num_slices > 0 but no slices exist → reset to 0, mark 'failed'.
    """
    candidates = (
        db.query(CTStudy)
        .filter((CTStudy.status == "processing") | (CTStudy.num_slices > 0))
        .all()
    )
    changed = False
    for s in candidates:
        actual = (
            db.query(func.count(CTSlice.id))
            .filter(CTSlice.study_id == s.id)
            .scalar()
            or 0
        )
        if actual > 0 and (s.status != "uploaded" or s.num_slices != actual):
            s.status = "uploaded"
            s.num_slices = actual
            changed = True
        elif actual == 0 and s.num_slices != 0:
            s.num_slices = 0
            if s.status == "processing":
                s.status = "failed"
            changed = True
    if changed:
        db.commit()


def _load_volume(db, study_id: int, modality: str,
                 series_uid: str | None = None) -> np.ndarray:
    """Decode every slice of a study (or one series) into a stacked
    float32 volume.

    When `series_uid` is given, only slices belonging to that series
    contribute to the volume — important for multi-sequence MRI where
    stacking T1, T2, PD, and the localizer together produces an
    incoherent 'volume' the AI can't read.

    Slices are sorted by (slice_index, instance_number) so that the
    rendered volume reflects the anatomical order, not upload order.
    """
    slices = (
        db.query(CTSlice)
        .filter(CTSlice.study_id == study_id)
        .order_by(CTSlice.slice_index, CTSlice.instance_number)
        .all()
    )
    if series_uid:
        slices = [
            s for s in slices
            if isinstance(s.extra, dict)
            and s.extra.get("series_uid") == series_uid
        ]
    arrays = []
    target_shape = None
    for sl in slices:
        try:
            arr, _ = decode_slice(sl.dicom_bytes, modality)
        except Exception:
            continue
        if target_shape is None:
            target_shape = arr.shape
        if arr.shape == target_shape:
            arrays.append(arr)
    if not arrays:
        return np.zeros((0,), dtype=np.float32)
    return np.stack(arrays)


def _list_series_in_study(db, study_id: int) -> list[dict]:
    """Aggregate the per-series breakdown for one study by reading
    the `extra` JSON on each CTSlice. Returns rows ordered by
    SeriesNumber when available, otherwise by SeriesUID.

    Output shape: [{
        "series_uid", "series_number", "description", "plane",
        "modality", "count", "pixel_spacing", "slice_thickness",
        "image_orientation", "laterality", "protocol_name", "body_part",
    }, ...]
    """
    rows = (
        db.query(CTSlice)
        .filter(CTSlice.study_id == study_id)
        .all()
    )
    bins: dict[str, dict] = {}
    for sl in rows:
        meta = sl.extra if isinstance(sl.extra, dict) else {}
        uid = meta.get("series_uid") or ""
        if uid not in bins:
            bins[uid] = {
                "series_uid": uid,
                "series_number": meta.get("series_number") or 0,
                "description": meta.get("series_description") or "",
                "plane": meta.get("plane") or "unknown",
                "modality": meta.get("modality") or "",
                "count": 0,
                "pixel_spacing": meta.get("pixel_spacing") or "",
                "slice_thickness": meta.get("slice_thickness") or "",
                "image_orientation": meta.get("image_orientation"),
                "laterality": meta.get("laterality") or "",
                "protocol_name": meta.get("protocol_name") or "",
                "body_part": meta.get("body_part") or "",
            }
        bins[uid]["count"] += 1
    return sorted(
        bins.values(),
        key=lambda r: (r.get("series_number") or 0, r.get("series_uid") or ""),
    )


def _study_picker(db) -> CTStudy | None:
    """Render a 'Select Study' dropdown over uploaded studies.

    Returns the chosen CTStudy row or None when no uploaded studies
    exist. Also loads the volume into session cache on selection.
    """
    _reconcile_studies(db)
    studies = (
        db.query(CTStudy)
        .filter(CTStudy.num_slices > 0)
        .order_by(CTStudy.upload_date.desc())
        .all()
    )

    if not studies:
        st.info(
            "لا توجد دراسات متاحة. ابدأ بـ **📤 رفع دراسة جديدة**. / "
            "No studies available. Start with **Upload**."
        )
        return None

    options = {f"#{s.id} — {s.study_description or 'بدون وصف'} ({s.modality}) | {s.num_slices} شريحة": s.id for s in studies}
    option_keys = list(options.keys())

    default_idx = 0
    sel_id = st.session_state.get("selected_study_id")
    if sel_id:
        for i, k in enumerate(option_keys):
            if options[k] == sel_id:
                default_idx = i
                break

    chosen_label = st.selectbox(
        "اختر الدراسة / Select Study",
        option_keys,
        index=default_idx,
        key="study_picker",
    )
    chosen_id = options[chosen_label]

    if chosen_id != st.session_state.get("selected_study_id"):
        # Switching studies invalidates everything else.
        _clear_study_state()
        st.session_state.selected_study_id = chosen_id

    study = next(s for s in studies if s.id == chosen_id)

    # Back-fill missing series metadata on studies uploaded before the
    # series-aware code shipped. Idempotent — only does real work the
    # first time we see an old study.
    if _enrich_legacy_metadata(db, study):
        # The cache may now point at stale series info; force a reload.
        st.session_state.pop("loaded_volume", None)
        st.session_state.pop("_cached_for_study", None)
        st.session_state.pop("loaded_series", None)

    # ── Per-series picker ────────────────────────────────────────
    # When the study contains more than one DICOM series (typical for
    # MRI: separate T1 / T2 / PD-FS / localizer acquisitions, possibly
    # in different planes) stacking them all into one 'volume' is
    # incoherent. Offer the doctor an explicit pick.
    series_list = _list_series_in_study(db, study.id)
    chosen_series = None
    if len(series_list) > 1:
        labels = {}
        for s in series_list:
            tag = s["description"] or f"Series {s['series_number']}" if s["series_number"] else (s["description"] or "All slices")
            lat = f" ({s['laterality']})" if s["laterality"] else ""
            plane = s["plane"] if s["plane"] != "unknown" else "—"
            sn = f"{s['series_number']}: " if s["series_number"] else ""
            labels[
                f"{sn}{tag}{lat} — {plane} | {s['count']} شريحة"
            ] = s["series_uid"]
        key_list = list(labels.keys())

        prior = st.session_state.get("selected_series_uid")
        default_idx = 0
        if prior:
            for i, k in enumerate(key_list):
                if labels[k] == prior:
                    default_idx = i
                    break
        chosen_label = st.selectbox(
            "اختر السلسلة / Select Series",
            key_list,
            index=default_idx,
            key="series_picker",
            help=(
                "كل MRI/CT يحتوي عدة سلاسل (تتابعات أو إسقاطات مختلفة). "
                "اختر السلسلة المطلوب تحليلها — لا تخلطها."
            ),
        )
        chosen_series = labels[chosen_label]
        if chosen_series != st.session_state.get("selected_series_uid"):
            st.session_state.selected_series_uid = chosen_series
            st.session_state.pop("loaded_volume", None)
            st.session_state.pop("_cached_for_study", None)
            st.session_state.pop("_cached_for_series", None)
    else:
        # Single series — clear any stale selection
        st.session_state.pop("selected_series_uid", None)

    # Cache decoded volume per (study, series) combination
    cache_key = (study.id, chosen_series)
    if (
        st.session_state.get("loaded_volume") is None
        or st.session_state.get("_cached_for_study") != cache_key
    ):
        with st.spinner("جاري فك تشفير الشرائح... / Decoding slices..."):
            volume = _load_volume(db, study.id, study.modality,
                                  series_uid=chosen_series)
        st.session_state.loaded_volume = volume
        st.session_state.loaded_modality = study.modality
        # Pixel spacing & series metadata are now sourced from the
        # chosen series, not the (potentially mixed) study-level row.
        if chosen_series:
            picked = next(
                (r for r in series_list if r["series_uid"] == chosen_series),
                None,
            )
            if picked:
                st.session_state.loaded_pixel_spacing = picked.get("pixel_spacing") or ""
                st.session_state.loaded_series = picked
            else:
                st.session_state.loaded_pixel_spacing = study.pixel_spacing or ""
                st.session_state.loaded_series = None
        else:
            st.session_state.loaded_pixel_spacing = study.pixel_spacing or ""
            st.session_state.loaded_series = series_list[0] if series_list else None
        st.session_state._cached_for_study = cache_key

    return study


# ──────────────────────────────────────────────────────────────────
# PAGE: Home
# ──────────────────────────────────────────────────────────────────

def show_home():
    st.markdown(
        """
        <div class="main-header">
            <h1>🏥 منصة تحليل الأشعة الطبية</h1>
            <p>Medical Imaging Analysis Platform — CT &amp; MRI Reading Support</p>
        </div>
        """,
        unsafe_allow_html=True,
    )
    st.markdown(
        """
        <div class="pro-notice">
            <strong>⚠️ ملاحظة مهنية / Professional notice:</strong>
            هذه المنصة موجَّهة للأطباء و أخصائيي الأشعة كأداة دعم قراءة.
            المسؤولية النهائية على الطبيب المعالج.
            &nbsp;|&nbsp;
            Reading-support tool for physicians and radiologists.
            Final responsibility rests with the attending physician.
        </div>
        """,
        unsafe_allow_html=True,
    )

    db = SessionLocal()
    try:
        n_studies = db.query(CTStudy).filter(CTStudy.num_slices > 0).count()
        n_analyses = db.query(AnalysisResult).count()
        n_slices = db.query(func.coalesce(func.sum(CTStudy.num_slices), 0)).scalar()
    finally:
        db.close()

    c1, c2, c3 = st.columns(3)
    c1.metric("الدراسات / Studies", n_studies)
    c2.metric("الشرائح / Slices", int(n_slices or 0))
    c3.metric("التحليلات / Analyses", n_analyses)

    st.markdown("---")
    st.subheader("ابدأ الآن / Get started")
    st.write(
        "1. ارفع دراسة من **📤 رفع دراسة جديدة** (ملفات DICOM مباشرة أو أرشيف .zip/.rar).\n"
        "2. تصفّح الصور من **🖥️ عارض الصور** مع نوافذ العرض و التكبير.\n"
        "3. اطلب تقريراً منظماً من **🔬 تحليل بالذكاء الاصطناعي**.\n"
        "4. ناقش الدراسة في **💬 محادثة / Q&A**."
    )


# ──────────────────────────────────────────────────────────────────
# Clinical-history form
# ──────────────────────────────────────────────────────────────────

_BODY_PART_OPTIONS = [
    "Knee", "Shoulder", "Hip", "Ankle / Foot", "Spine",
    "Brain / Head", "Chest / Thorax", "Abdomen / Pelvis",
    "Prostate", "Breast", "Liver", "Other / Not specified",
]


def _collect_clinical_context() -> str:
    """Render a structured clinical-history form and assemble the
    answers into a clean text block.

    Returns an English-formatted multi-line string suitable for direct
    injection into the AI prompt under the 'PHYSICIAN'S CLINICAL
    CONTEXT' header. Empty fields are omitted from the output, so a
    half-filled form still produces a clean block.

    The form is body-part aware: selecting 'Knee' surfaces knee-
    specific yes/no questions (McMurray, locking, instability...);
    'Prostate' surfaces PSA, DRE, dysuria; etc.
    """
    with st.expander(
        "📋 التاريخ المرضى للمريض — أهم حقل لجودة التقرير / "
        "Patient clinical history — most impactful field for report quality",
        expanded=True,
    ):
        st.caption(
            "املأ ما تعرفه عن المريض. كل حقل تتركه فارغاً يُتجاهل. "
            "اختيار العضو يُظهر أسئلة إضافية مخصصة له."
        )

        # ── General questions ──
        gc1, gc2, gc3 = st.columns(3)
        with gc1:
            age = st.number_input(
                "العمر / Age", min_value=0, max_value=120, value=0, step=1,
                help="اتركه 0 إن مجهول",
            )
            sex = st.radio(
                "الجنس / Sex",
                ["—", "Male", "Female"],
                horizontal=True,
                index=0,
            )
        with gc2:
            complaint = st.text_input(
                "الشكوى الرئيسية / Chief complaint",
                placeholder="e.g., right knee pain after fall",
            )
            duration = st.text_input(
                "مدة الأعراض / Duration",
                placeholder="e.g., 2 weeks / 6 months",
            )
        with gc3:
            body_part = st.selectbox(
                "العضو المفحوص / Body part",
                _BODY_PART_OPTIONS,
                index=len(_BODY_PART_OPTIONS) - 1,
            )

        mechanism = st.text_area(
            "آلية الإصابة (إن وُجدت) / Mechanism of injury (if any)",
            placeholder="e.g., twisting on planted foot while pivoting",
            height=70,
        )

        c1, c2 = st.columns(2)
        with c1:
            pmh = st.text_area(
                "الأمراض المزمنة / Past medical history",
                placeholder="HTN, DM, prior malignancy, hepatitis ...",
                height=70,
            )
            meds = st.text_input(
                "الأدوية الحالية / Current medications",
                placeholder="e.g., metformin, aspirin, anticoagulant",
            )
        with c2:
            prior_surgery = st.text_area(
                "عمليات سابقة على نفس المنطقة / Prior surgery on this region",
                placeholder="e.g., ACL reconstruction 2018",
                height=70,
            )
            allergies = st.text_input(
                "حساسية / Allergies",
                placeholder="e.g., iodinated contrast",
            )

        exam = st.text_area(
            "الفحص السريرى / Physical exam highlights",
            placeholder="e.g., + McMurray, joint effusion, focal tenderness over MCL",
            height=70,
        )

        # ── Body-part-specific questions ──
        specific = _body_part_specific_form(body_part)

        # ── Free-text catch-all ──
        free_text = st.text_area(
            "ملاحظات إضافية / Additional notes",
            placeholder="أى معلومات أخرى تساعد فى قراءة التقرير",
            height=70,
        )

    return _assemble_clinical_context(
        age=age,
        sex=sex,
        complaint=complaint,
        duration=duration,
        body_part=body_part,
        mechanism=mechanism,
        pmh=pmh,
        meds=meds,
        prior_surgery=prior_surgery,
        allergies=allergies,
        exam=exam,
        specific=specific,
        free_text=free_text,
    )


def _body_part_specific_form(body_part: str) -> dict:
    """Render the questions a consultant would normally ask for this
    region. Each question's answer is returned as a string in the dict.
    """
    answers: dict = {}
    bp = (body_part or "").lower()

    if "knee" in bp:
        st.markdown("**🦵 Knee-specific:**")
        c1, c2, c3 = st.columns(3)
        with c1:
            answers["Pain location"] = st.selectbox(
                "Pain location",
                ["—", "Medial", "Lateral", "Anterior", "Posterior", "Diffuse"],
                index=0,
            )
            answers["Joint locking"] = _yesno("Joint locking / catching")
        with c2:
            answers["Effusion"] = _yesno("Visible swelling / effusion")
            answers["Instability"] = _yesno("Subjective instability / giving-way")
        with c3:
            answers["McMurray test"] = st.selectbox(
                "McMurray test", ["—", "Negative", "Positive medial", "Positive lateral", "Not done"], index=0,
            )
            answers["Anterior drawer"] = st.selectbox(
                "Anterior drawer / Lachman", ["—", "Negative", "Positive", "Not done"], index=0,
            )

    elif "prostate" in bp:
        st.markdown("**💧 Prostate-specific:**")
        c1, c2 = st.columns(2)
        with c1:
            answers["PSA (ng/mL)"] = st.text_input("PSA value (ng/mL)", placeholder="e.g., 12.4")
            answers["DRE findings"] = st.selectbox(
                "DRE findings",
                ["—", "Normal", "Asymmetric / nodular", "Hard / fixed", "Not done"],
                index=0,
            )
        with c2:
            answers["Urinary symptoms"] = st.text_input(
                "Urinary symptoms", placeholder="e.g., dysuria, frequency, nocturia",
            )
            answers["Prior biopsy"] = st.selectbox(
                "Prior prostate biopsy", ["—", "None", "Negative", "Positive (Gleason ...)"], index=0,
            )

    elif "liver" in bp or "abdomen" in bp or "pelvis" in bp:
        st.markdown("**🫁 Hepatic / Abdominal-specific:**")
        c1, c2 = st.columns(2)
        with c1:
            answers["Viral hepatitis"] = st.selectbox(
                "Viral hepatitis", ["—", "None", "HBV", "HCV", "Both"], index=0,
            )
            answers["Cirrhosis"] = _yesno("Known cirrhosis")
            answers["Alcohol"] = st.selectbox(
                "Alcohol use", ["—", "None", "Social", "Heavy"], index=0,
            )
        with c2:
            answers["AFP (ng/mL)"] = st.text_input("AFP value (ng/mL)", placeholder="e.g., 200")
            answers["Known malignancy"] = st.text_input(
                "Known malignancy", placeholder="e.g., colorectal Ca on follow-up",
            )

    elif "lung" in bp or "chest" in bp or "thorax" in bp:
        st.markdown("**🫁 Pulmonary-specific:**")
        c1, c2 = st.columns(2)
        with c1:
            answers["Smoking"] = st.text_input(
                "Smoking (pack-years)", placeholder="e.g., 30 pack-years",
            )
            answers["Hemoptysis"] = _yesno("Hemoptysis")
            answers["Weight loss"] = _yesno("Unintentional weight loss")
        with c2:
            answers["Known TB"] = _yesno("Known or treated TB")
            answers["Occupational exposure"] = st.text_input(
                "Occupational exposure", placeholder="e.g., asbestos, silica",
            )

    elif "brain" in bp or "head" in bp:
        st.markdown("**🧠 Neurological-specific:**")
        c1, c2 = st.columns(2)
        with c1:
            answers["Focal deficit"] = st.text_input(
                "Focal neurological deficit", placeholder="e.g., right hemiparesis",
            )
            answers["Seizures"] = _yesno("Seizure history")
        with c2:
            answers["Headache pattern"] = st.selectbox(
                "Headache pattern",
                ["—", "None", "Acute thunderclap", "Chronic progressive", "Migraine-like", "Other"],
                index=0,
            )
            answers["Recent trauma"] = _yesno("Recent head trauma")

    elif "spine" in bp:
        st.markdown("**🦴 Spine-specific:**")
        c1, c2 = st.columns(2)
        with c1:
            answers["Radiculopathy"] = st.text_input(
                "Radiculopathy / dermatome", placeholder="e.g., L5 right, S1 left",
            )
            answers["Weakness"] = _yesno("Motor weakness")
        with c2:
            answers["Bowel/bladder"] = _yesno("Bowel/bladder symptoms (red flag)")
            answers["Saddle anesthesia"] = _yesno("Saddle anesthesia (red flag)")

    elif "breast" in bp:
        st.markdown("**🎗️ Breast-specific:**")
        c1, c2 = st.columns(2)
        with c1:
            answers["Palpable mass"] = _yesno("Palpable mass")
            answers["Family history"] = _yesno("Family history of breast / ovarian Ca")
        with c2:
            answers["Hormonal status"] = st.selectbox(
                "Hormonal status",
                ["—", "Pre-menopausal", "Peri-menopausal", "Post-menopausal", "On HRT"],
                index=0,
            )
            answers["Prior BI-RADS"] = st.text_input(
                "Prior BI-RADS", placeholder="e.g., BI-RADS 3 last year",
            )

    elif "shoulder" in bp:
        st.markdown("**🦾 Shoulder-specific:**")
        c1, c2 = st.columns(2)
        with c1:
            answers["Mechanism"] = st.selectbox(
                "Onset", ["—", "Acute traumatic", "Repetitive overuse", "Insidious", "Post-surgical"], index=0,
            )
            answers["Painful arc"] = _yesno("Painful arc on abduction")
        with c2:
            answers["Drop-arm test"] = st.selectbox(
                "Drop-arm test", ["—", "Negative", "Positive", "Not done"], index=0,
            )
            answers["Range of motion"] = st.text_input(
                "Range of motion limitation", placeholder="e.g., abduction limited to 90°",
            )

    elif "ankle" in bp or "foot" in bp:
        st.markdown("**🦶 Ankle/Foot-specific:**")
        c1, c2 = st.columns(2)
        with c1:
            answers["Mechanism"] = st.selectbox(
                "Mechanism", ["—", "Inversion sprain", "Eversion", "Direct trauma", "Overuse"], index=0,
            )
            answers["Weight bearing"] = _yesno("Able to bear weight")
        with c2:
            answers["Ottawa positive"] = _yesno("Ottawa ankle rule positive")
            answers["Swelling site"] = st.text_input(
                "Swelling / tenderness location",
                placeholder="e.g., over ATFL, lateral malleolus",
            )

    elif "hip" in bp:
        st.markdown("**🦴 Hip-specific:**")
        c1, c2 = st.columns(2)
        with c1:
            answers["Mechanism"] = st.selectbox(
                "Onset", ["—", "Acute trauma", "Insidious", "Post-arthroplasty"], index=0,
            )
            answers["FABER test"] = st.selectbox(
                "FABER test", ["—", "Negative", "Positive", "Not done"], index=0,
            )
        with c2:
            answers["Limp"] = _yesno("Antalgic limp")
            answers["Groin pain"] = _yesno("Groin pain")

    return answers


def _yesno(label: str) -> str:
    """Render a tri-state Yes/No/—  radio and return the label answer."""
    return st.radio(label, ["—", "Yes", "No"], horizontal=True, index=0, key=f"yn_{label}")


def _assemble_clinical_context(*, age, sex, complaint, duration, body_part,
                                mechanism, pmh, meds, prior_surgery, allergies,
                                exam, specific: dict, free_text: str) -> str:
    """Stitch the structured form answers into a clean text block.

    The block is English-first because the downstream prompt operates
    in English. Empty fields are silently dropped so a half-filled
    form still produces a tidy context section.
    """
    def _line(label: str, value) -> str:
        if value is None:
            return ""
        if isinstance(value, str):
            value = value.strip()
            if not value or value == "—":
                return ""
        if isinstance(value, (int, float)) and value == 0:
            return ""
        return f"- {label}: {value}"

    lines: list[str] = []
    # Patient identifier line (combined where possible)
    if age and sex and sex != "—":
        sex_letter = "M" if sex == "Male" else "F" if sex == "Female" else sex
        lines.append(f"- Patient: {age}y {sex_letter}")
    elif age:
        lines.append(f"- Patient: {age}y")
    elif sex and sex != "—":
        lines.append(f"- Patient: {sex}")

    for label, value in [
        ("Chief complaint", complaint),
        ("Duration", duration),
        ("Body part", body_part if body_part and "not specified" not in body_part.lower() else None),
        ("Mechanism", mechanism),
        ("Past medical history", pmh),
        ("Current medications", meds),
        ("Prior surgery (this region)", prior_surgery),
        ("Allergies", allergies),
        ("Physical exam", exam),
    ]:
        line = _line(label, value)
        if line:
            lines.append(line)

    # Body-part-specific block
    specific_lines = []
    for key, val in (specific or {}).items():
        line = _line(key, val)
        if line:
            specific_lines.append(line)
    if specific_lines:
        lines.append(f"- {body_part}-specific findings:")
        for ln in specific_lines:
            lines.append("  " + ln)

    free_text = (free_text or "").strip()
    if free_text:
        lines.append(f"- Additional notes: {free_text}")

    return "\n".join(lines).strip()


# ──────────────────────────────────────────────────────────────────
# PAGE: Upload
# ──────────────────────────────────────────────────────────────────

def show_upload():
    st.header("📤 رفع دراسة جديدة / Upload New Study")
    st.info(
        "ارفع ملفات DICOM مباشرةً، أو ملف مضغوط (.zip / .rar) يحتوي شرائح الدراسة "
        "في فولدرات متداخلة. / Upload DICOM files directly, or one compressed "
        "archive containing slices in nested folders."
    )

    with st.expander("📝 معلومات الدراسة / Study Information", expanded=True):
        c1, c2 = st.columns(2)
        with c1:
            patient_id = st.text_input("معرّف المريض / Patient ID", placeholder="مثال: PAT001")
            modality = st.selectbox(
                "نوع الفحص / Modality",
                ["CT — أشعة مقطعية", "MRI — رنين مغناطيسي"],
            )
            description = st.text_input(
                "وصف الدراسة / Study Description",
                placeholder="CT Chest / MRI Brain",
            )
            side_choice = st.selectbox(
                "الجانب / Side",
                [
                    "Auto (from DICOM)",
                    "Right / يمين",
                    "Left / يسار",
                    "N/A — bilateral / non-paired",
                ],
                help=(
                    "حدد الجانب يدوياً إذا كان فارغاً في DICOM. كثير من ماسحات "
                    "MRI لا تملأ Laterality tag و يضيع الجانب من التقرير. "
                    "Manually override when the DICOM Laterality tag is blank."
                ),
            )
        with c2:
            study_date = st.date_input("تاريخ الدراسة / Study Date", value=datetime.now())
            notes = st.text_area(
                "ملاحظات سريرية / Clinical notes",
                help="ملاحظات قصيرة عن الدراسة (تظهر فى قائمة الدراسات).",
            )

    clinical_context = _collect_clinical_context()

    modality_key = "CT" if modality.startswith("CT") else "MRI"
    # Map the dropdown to the single-letter form used everywhere downstream.
    if side_choice.startswith("Right"):
        laterality_override = "R"
    elif side_choice.startswith("Left"):
        laterality_override = "L"
    elif side_choice.startswith("N/A"):
        laterality_override = "NA"  # explicit 'not applicable' to suppress the warning later
    else:
        laterality_override = ""  # auto-detect

    uploaded = st.file_uploader(
        "اختر الملفات / Select files",
        # Accept ANY file extension — server-side filtering by magic
        # bytes (looks_like_radiology_input) decides what's actually
        # processed. This lets CD-ROM dumps with mixed content
        # (LABEL.TXT, INDEX.HTM, viewer .chm, DICOM files without
        # extensions) upload in one shot; non-radiology files are
        # silently skipped with an info note.
        type=None,
        accept_multiple_files=True,
        help=(
            "ادعم: DICOM مباشرة (مع/بدون امتداد)، أرشيف (.zip/.rar)، "
            "manifest من TCIA (.tcia)، أو صور شعاعية (.bmp/.png/.jpg/.tiff).\n\n"
            "🧩 للملفات الكبيرة: قسّمها إلى أجزاء (~50MB لكل جزء) عبر WinRAR "
            "أو 7-Zip ('Split to volumes')، ثم ارفع كل ملفات .part1.rar / "
            ".part2.rar / ... معاً فى نفس البراوز — التطبيق يُعيد تجميعها تلقائياً.\n\n"
            "💿 لـ CD-ROM dumps (مجلد DICOMOBJ): يمكنك رفع المجلد كاملاً — "
            "الملفات غير DICOM (LABEL.TXT/INDEX.HTM/PD-Viewer.chm) تُتجاوز "
            "تلقائياً."
        ),
    )

    # `process_requested` tracks whether the doctor pressed either the
    # HTTP-upload 'Upload & Process' OR the inbox-folder 'Process now'
    # button this run. Both paths converge on the same downstream
    # pipeline (discover_dicom_files → persist).
    process_requested = False

    if uploaded:
        st.success(
            f"✅ تم اختيار {len(uploaded)} ملف عبر الرفع / "
            f"{len(uploaded)} file(s) selected via upload"
        )
        if st.button(
            "🚀 رفع و معالجة / Upload & Process",
            type="primary",
            key="http_process",
        ):
            process_requested = True

    # ── User-facing fallback path: paste a Google Drive link ─────────
    # For studies bigger than what Replit's HTTP gateway will accept
    # (~30 MB), the doctor zips the folder once, uploads it to Drive,
    # right-clicks → "Share" → "Anyone with the link", pastes the URL
    # here. The server fetches it directly so the browser never sends
    # a multi-hundred-MB request.
    st.markdown("---")
    with st.expander(
        "☁️ أو الصق رابط Google Drive للملف المضغوط / "
        "Or paste a Google Drive link to a zipped study",
        expanded=False,
    ):
        st.caption(
            "للملفات الكبيرة (>30MB): ارفع ملف ZIP/RAR على Google Drive، "
            "اضبط Share على \"Anyone with the link\"، ثم الصق الرابط هنا. "
            "السيرفر سيُحمّل الملف مباشرة دون المرور بمتصفحك."
        )
        gdrive_url = st.text_input(
            "Google Drive URL",
            value="",
            placeholder="https://drive.google.com/file/d/FILE_ID/view?usp=sharing",
            key="gdrive_url",
        )
        if st.button(
            "📥 تحميل من Google Drive / Download from Drive",
            type="primary",
            disabled=not gdrive_url.strip(),
            key="gdrive_process",
        ):
            from dicom_io import download_from_gdrive
            log(f"gdrive: starting download from {gdrive_url[:80]}...")
            try:
                with st.spinner("📡 جارى التحميل من Google Drive... / Downloading..."):
                    fetched = download_from_gdrive(gdrive_url.strip())
                log(f"gdrive: downloaded {fetched.name}, {fetched.size_bytes/1e6:.1f} MB")
                st.success(
                    f"✅ تم التحميل: {fetched.name} ({fetched.size_bytes/1e6:.1f} MB)"
                )
                uploaded = [fetched]
                process_requested = True
            except Exception as e:
                log(f"gdrive: FAILED {type(e).__name__}: {e}", "error")
                st.error(f"❌ فشل التحميل: {e}")

    # ── Admin-only fallback path: filesystem inbox (no HTTP upload) ──
    # Shown ONLY when the operator has explicitly set CT_INBOX_DIR in
    # the deployment environment. End users (radiology center staff)
    # never see this section — it's a workaround for development /
    # admin debugging on platforms with tight HTTP gateway limits.
    inbox_dir = os.environ.get("CT_INBOX_DIR")
    if inbox_dir:
        st.markdown("---")
        with st.expander(
            "⚙️ Admin: pick from filesystem inbox",
            expanded=False,
        ):
            st.caption(
                f"Admin / debug path. Reads files dropped into `{inbox_dir}/` "
                f"on the server. Useful when the HTTP gateway is rate-limited."
            )
            col_a, col_b = st.columns([1, 3])
            with col_a:
                refresh = st.button("🔄 Refresh", key="inbox_refresh")
            with col_b:
                st.text(f"Folder: {os.path.abspath(inbox_dir)}")

            try:
                os.makedirs(inbox_dir, exist_ok=True)
                entries = sorted(os.listdir(inbox_dir))
            except OSError as e:
                entries = []
                st.error(f"❌ Cannot read {inbox_dir}: {e}")

            if not entries:
                st.info(f"Folder empty. Drop files into `{inbox_dir}/` on the server.")
            else:
                file_sizes = []
                for entry in entries:
                    full = os.path.join(inbox_dir, entry)
                    try:
                        size = os.path.getsize(full) if os.path.isfile(full) else None
                    except OSError:
                        size = None
                    file_sizes.append((entry, full, size))
                st.write(f"📦 {len(file_sizes)} items in folder:")
                for entry, full, size in file_sizes[:50]:
                    if size is None:
                        st.text(f"  📂 {entry}/  (folder)")
                    else:
                        st.text(f"  📄 {entry}  ({size / 1024 / 1024:.1f} MB)")
                if len(file_sizes) > 50:
                    st.caption(f"… +{len(file_sizes) - 50} more")

                if st.button(
                    "🚀 Process all files in folder",
                    type="primary",
                    key="inbox_process",
                ):
                    class _LocalFile:
                        __slots__ = ("name", "_path")
                        def __init__(self, name: str, path: str):
                            self.name = name
                            self._path = path
                        def read(self) -> bytes:
                            with open(self._path, "rb") as f:
                                return f.read()

                    local_uploaded = [
                        _LocalFile(name, full)
                        for name, full, size in file_sizes
                        if size is not None
                    ]
                    uploaded = local_uploaded
                    process_requested = True
                    st.success(f"✅ Processing {len(local_uploaded)} files from folder.")

    if not process_requested:
        return

    # If any upload is a TCIA manifest, surface live download progress
    # because each series can take several seconds to fetch.
    has_tcia = any(f.name.lower().endswith(".tcia") for f in uploaded)
    progress_bar = st.progress(0.0) if has_tcia else None
    progress_text = st.empty() if has_tcia else None

    def _tcia_cb(i: int, total: int, msg: str) -> None:
        if progress_bar is None or progress_text is None:
            return
        progress_bar.progress(min(1.0, (i + 1) / max(total, 1)))
        if msg == "done":
            progress_text.text("✅ اكتمل تنزيل TCIA / TCIA download complete.")
        else:
            short = msg[-40:] if len(msg) > 40 else msg
            progress_text.text(
                f"📡 TCIA: تنزيل السلسلة {i + 1}/{total} … {short}"
            )

    log(f"upload: process clicked; {len(uploaded)} UploadedFile objects received")
    for u in uploaded[:5]:
        log(f"  upload[head]: name={u.name!r} size={getattr(u, 'size', '?')}")
    if len(uploaded) > 5:
        log(f"  upload[head]: … +{len(uploaded) - 5} more")
    with st.spinner("جاري الاستخراج و الكشف عن DICOM... / Extracting and detecting DICOM..."):
        log("discover_dicom_files: starting")
        try:
            discovered, info_msgs, error_msgs = discover_dicom_files(
                uploaded, tcia_progress=_tcia_cb
            )
        except Exception as e:
            log(f"discover_dicom_files: CRASHED {type(e).__name__}: {e}", "error")
            raise
        log(
            f"discover_dicom_files: returned {len(discovered)} discovered, "
            f"{len(info_msgs)} info, {len(error_msgs)} errors"
        )

    for msg in info_msgs:
        st.info(msg)
    for msg in error_msgs:
        st.warning(msg)

    if not discovered:
        st.error(
            "❌ لم يتم العثور على أي ملف DICOM صالح. / "
            "No valid DICOM files were found."
        )
        return

    # Build a per-series inventory so we (a) detect modality from the
    # DICOM headers rather than trusting the dropdown blindly and (b)
    # let the doctor see exactly what's in the upload before we commit
    # it to the database.
    series = inventory_series(discovered)
    detected_modality = _dominant_modality(series)

    st.info(
        f"🔎 إجمالي ملفات DICOM: {len(discovered)} موزعة على "
        f"{len(series)} سلسلة. / "
        f"Detected {len(discovered)} DICOM files across {len(series)} series."
    )

    _render_series_table(series)

    # Reconcile DICOM-reported modality with the dropdown the doctor picked.
    if detected_modality and detected_modality != modality_key:
        st.warning(
            f"⚠️ اخترت **{modality_key}** في القائمة لكن ملفات DICOM تقول "
            f"**{detected_modality}**. سأعتمد ما هو مكتوب في الـ DICOM. / "
            f"You selected **{modality_key}** but the DICOM headers report "
            f"**{detected_modality}**. The DICOM value will be used."
        )
        effective_modality = detected_modality
    else:
        effective_modality = detected_modality or modality_key

    _persist_study(
        discovered=discovered,
        series=series,
        patient_id=patient_id,
        study_date=study_date,
        description=description,
        notes=notes,
        modality=effective_modality,
        laterality=laterality_override,
        clinical_context=clinical_context,
    )


def _dominant_modality(series) -> str:
    """Return the most common modality across the series inventory."""
    counts: dict[str, int] = {}
    for s in series:
        if s.modality:
            counts[s.modality] = counts.get(s.modality, 0) + s.count
    if not counts:
        return ""
    return max(counts.items(), key=lambda kv: kv[1])[0]


def _render_series_table(series) -> None:
    """Display the per-series breakdown as a Streamlit dataframe."""
    if not series:
        return
    rows = [
        {
            "Series": s.description or "(no description)",
            "Modality": s.modality or "?",
            "Plane": s.plane,
            "Slices": s.count,
            "Body part": s.body_part or "—",
        }
        for s in series
    ]
    st.markdown("**📚 السلاسل المكتشفة / Discovered series**")
    st.dataframe(rows, hide_index=True, use_container_width=True)


def _persist_study(
    *,
    discovered,
    series,
    patient_id,
    study_date,
    description,
    notes,
    modality,
    laterality: str = "",
    clinical_context: str = "",
):
    """Stream slices into DB in small batches.

    Memory discipline:
      * Each iteration holds at most one slice's bytes + decoded header.
      * After every BATCH_SIZE adds, commit + expire_all + gc.collect.
      * No accumulated numpy arrays — the viewer rebuilds the volume
        on demand from the stored DICOM bytes.

    `laterality` is the doctor's explicit override ('R' / 'L' / 'NA' /
    '' for auto-detect). Stored on the CTStudy row and used as the
    authoritative side throughout the downstream analysis pipeline.
    """
    BATCH_SIZE = 50  # bigger batch → fewer DB commits → faster end-to-end
    st.info(
        f"💾 جارى حفظ {len(discovered)} ملف DICOM فى قاعدة البيانات. "
        f"قد يستغرق 1-3 دقائق — لا تغلق الصفحة. / "
        f"Saving {len(discovered)} DICOM files to the database. "
        f"May take 1-3 minutes — keep this tab open."
    )
    progress = st.progress(0.0)
    status = st.empty()

    log(
        f"_persist_study: starting; {len(discovered)} files across "
        f"{len(series)} series; modality={modality} laterality={laterality!r}"
    )
    db = SessionLocal()
    try:
        study = CTStudy(
            patient_id=patient_id or "Unknown",
            study_date=study_date,
            study_description=description or f"{modality} Study",
            modality=modality,
            laterality=laterality or "",
            notes=notes,
            clinical_context=(clinical_context or "").strip() or None,
            num_slices=0,
            status="processing",
        )
        db.add(study)
        db.commit()
        db.refresh(study)

        # FAST PATH: bulk insert. Per-row db.add + per-batch commit was
        # taking 1-3 minutes on a 362-slice CD-ROM upload and Replit's
        # gateway was dropping the WebSocket mid-save ('CONNECTING…').
        # We now:
        #   1. Parse the FIRST file's headers only (to fill the study-
        #      level fields like image_dimensions / pixel_spacing).
        #   2. Bulk-build all slice rows with empty `extra`.
        #   3. One bulk_save_objects + one commit.
        # _enrich_legacy_metadata fills the per-slice extras lazily the
        # first time the doctor opens the study.
        added = 0
        failures: list[tuple[str, str]] = []
        first_meta: dict | None = None

        # Pre-parse first file ONLY for study-level dimensions
        try:
            first_meta = _safe_header(discovered[0].data) if discovered else None
        except Exception:
            first_meta = None

        # Build slice payloads as plain dicts — bulk_insert_mappings
        # is significantly faster than building ORM instances and lets
        # PostgreSQL stream the rows. We commit in CHUNK_SIZE chunks
        # because a single 18 MB transaction on Replit's managed PG
        # was dropping the connection mid-write and the entire
        # 362-slice upload reported zero saved.
        # 20 slices per transaction × ~420 KB each ≈ 8 MB per commit,
        # comfortably below what Replit's managed Postgres and Neon's
        # free tier will accept without dropping the connection. Bigger
        # chunks (100) were timing out on real 500-slice uploads.
        CHUNK_SIZE = 20
        status.text(
            f"💾 تجهيز {len(discovered)} شريحة للحفظ المُقَسَّم... / "
            f"Preparing {len(discovered)} slices for chunked insert..."
        )
        progress.progress(0.2)

        # Persist series-by-series so the doctor sees each one progress
        # in its own status block, and so a memory blip during a later
        # series doesn't lose the earlier ones. Within each series we
        # still chunk by CHUNK_SIZE rows per commit.
        total = len(discovered)
        global_idx = 0
        log(f"_persist_study: created study row id={study.id}, looping series")
        for s_idx, s in enumerate(series, 1):
            s_label = (s.description or f"Series {s_idx}").strip() or f"Series {s_idx}"
            log(f"  series {s_idx}/{len(series)}: {s_label} ({s.count} slices) — starting")
            with st.status(
                f"💾 جارى حفظ السلسلة {s_idx}/{len(series)}: {s_label} ({s.count} شريحة) "
                f"/ Saving series {s_idx}/{len(series)}: {s_label} ({s.count} slices)",
                expanded=True,
            ) as s_status:
                s_added = 0
                s_total = len(s.files)
                s_chunks = (s_total + CHUNK_SIZE - 1) // CHUNK_SIZE
                for ci in range(s_chunks):
                    chunk_start = ci * CHUNK_SIZE
                    chunk_end = min(chunk_start + CHUNK_SIZE, s_total)
                    chunk: list[dict] = []
                    for j in range(chunk_start, chunk_end):
                        df = s.files[j]
                        is_first = global_idx == 0
                        chunk.append({
                            "study_id": study.id,
                            "slice_index": global_idx,
                            "instance_number": global_idx,
                            "slice_location": None,
                            "sop_instance_uid": None,
                            "rows": (first_meta or {}).get("rows") if is_first else None,
                            "columns": (first_meta or {}).get("columns") if is_first else None,
                            "dicom_bytes": df.data,
                            "extra": {
                                "series_uid": s.series_uid,
                                "series_description": s.description,
                                "modality": s.modality,
                                "plane": s.plane,
                                "body_part": s.body_part,
                            },
                        })
                        global_idx += 1
                    try:
                        db.bulk_insert_mappings(CTSlice, chunk)
                        db.commit()
                        s_added += len(chunk)
                        added += len(chunk)
                        log(
                            f"    series {s_idx} chunk {ci + 1}/{s_chunks}: "
                            f"committed {len(chunk)} slices (s_added={s_added}/{s_total}, total={added})"
                        )
                        s_status.update(
                            label=(
                                f"💾 السلسلة {s_idx}/{len(series)}: {s_label} — "
                                f"{s_added}/{s_total} شريحة محفوظة / "
                                f"{s_added}/{s_total} slices saved"
                            )
                        )
                        progress.progress(min(1.0, 0.2 + 0.8 * added / max(total, 1)))
                    except Exception as e:
                        db.rollback()
                        failures.append((f"series_{s_idx}_chunk_{ci}", str(e)))
                        log(
                            f"    series {s_idx} chunk {ci + 1}/{s_chunks}: "
                            f"FAILED {type(e).__name__}: {e}",
                            "error",
                        )
                        s_status.update(
                            label=f"⚠️ {s_label}: تعذّر حفظ دفعة — Skipped a chunk",
                            state="error",
                        )
                    finally:
                        chunk.clear()
                        gc.collect()
                        # Tiny breather so the Streamlit WebSocket
                        # heartbeat fires between commits — Replit's
                        # proxy was closing connections that stayed
                        # silent for the duration of a 100-slice batch.
                        time.sleep(0.05)
                if s_added == s_total:
                    s_status.update(
                        label=f"✅ {s_label} — {s_added}/{s_total} شريحة",
                        state="complete",
                        expanded=False,
                    )
                elif s_added > 0:
                    s_status.update(
                        label=f"⚠️ {s_label} — {s_added}/{s_total} (partial)",
                        state="error",
                    )
                else:
                    s_status.update(
                        label=f"❌ {s_label} — 0/{s_total} (لم تُحفظ أى شريحة)",
                        state="error",
                    )

        # Final study-level update
        if added > 0:
            study.num_slices = added
            study.status = "uploaded"
            if first_meta:
                rows = first_meta.get("rows") or 0
                cols = first_meta.get("columns") or 0
                if rows and cols:
                    study.image_dimensions = f"{rows}x{cols}"
                study.pixel_spacing = first_meta.get("pixel_spacing") or None
                try:
                    if first_meta.get("slice_thickness"):
                        study.slice_thickness = float(first_meta["slice_thickness"])
                except (ValueError, TypeError):
                    pass
        else:
            study.status = "failed"
            top_reason = (
                Counter(r for _, r in failures).most_common(1)[0][0]
                if failures
                else "Unknown failure / فشل غير معروف"
            )
            study.notes = (
                (study.notes or "")
                + f"\n[فشل الرفع / Upload failed] {len(failures)}/{len(discovered)}: {top_reason[:300]}"
            ).strip()
        db.commit()

        progress.progress(1.0)
        status.text("اكتملت المعالجة! / Done.")

        if added == 0:
            st.error(
                "❌ لم تنجح أي شريحة في المعالجة. تم وسم الدراسة كفاشلة. / "
                "No slices processed. The study has been marked as failed."
            )
            if failures:
                with st.expander("تفاصيل الفشل / Failure details"):
                    for name, reason in failures[:20]:
                        st.write(f"- **{name}**: {reason}")
                    if len(failures) > 20:
                        st.caption(f"… +{len(failures) - 20} more")
            return

        st.success(
            f"✅ تم رفع الدراسة #{study.id} بنجاح ({added} شريحة). / "
            f"Study #{study.id} uploaded successfully ({added} slices)."
        )
        if failures:
            with st.expander(f"⚠️ تخطّى {len(failures)} ملف / Skipped {len(failures)} files"):
                for name, reason in failures[:20]:
                    st.write(f"- **{name}**: {reason}")

        # Pin the new study; let the viewer page rebuild the volume.
        st.session_state.selected_study_id = study.id
        st.session_state.pop("loaded_volume", None)
        st.session_state.pop("_cached_for_study", None)

        st.info(
            "💡 انتقل إلى **🖥️ عارض الصور** أو **🔬 تحليل بالذكاء الاصطناعي**. / "
            "Go to the Viewer or AI Analysis."
        )
    except Exception as e:
        db.rollback()
        st.error(f"❌ خطأ أثناء الرفع / Upload error: {str(e)}")
    finally:
        db.close()


def _safe_header(dicom_bytes: bytes) -> dict:
    """Read header tags without raising on missing values."""
    from dicom_io import read_dicom_metadata
    try:
        return read_dicom_metadata(dicom_bytes)
    except Exception:
        return {}


# ──────────────────────────────────────────────────────────────────
# PAGE: Viewer
# ──────────────────────────────────────────────────────────────────

def show_viewer():
    st.header("🖥️ عارض الصور / Image Viewer")
    db = SessionLocal()
    try:
        study = _study_picker(db)
    finally:
        db.close()
    if not study:
        return

    volume = st.session_state.get("loaded_volume")
    if volume is None or volume.size == 0:
        st.error("لا يمكن فك تشفير الصور لهذه الدراسة. / Cannot decode this study.")
        return

    st.markdown(
        f"**#{study.id}** — {study.study_description or '—'} | "
        f"**{study.modality}** | {volume.shape[0]} شريحة"
    )
    render_dicom_viewer(
        volume,
        modality=study.modality,
        pixel_spacing=st.session_state.get("loaded_pixel_spacing", ""),
        key_prefix="main_viewer",
    )


# ──────────────────────────────────────────────────────────────────
# PAGE: Saved studies
# ──────────────────────────────────────────────────────────────────

def show_studies():
    st.header("📊 الدراسات المحفوظة / Saved Studies")
    db = SessionLocal()
    try:
        _reconcile_studies(db)
        studies = db.query(CTStudy).order_by(CTStudy.upload_date.desc()).all()
        if not studies:
            st.info("لا توجد دراسات محفوظة. / No studies stored.")
            return

        for study in studies:
            if study.status == "failed":
                icon = "❌"
            elif study.status == "processing":
                icon = "⏳"
            else:
                icon = "🔵" if study.modality == "MRI" else "🟢"
            header = (
                f"{icon} #{study.id} — {study.study_description or '—'} "
                f"({study.modality}) | {study.upload_date.strftime('%Y-%m-%d %H:%M')}"
            )
            with st.expander(header):
                c1, c2, c3 = st.columns([2, 2, 1])
                with c1:
                    st.write(f"**Patient ID:** {study.patient_id or '—'}")
                    st.write(f"**Study date:** {study.study_date or '—'}")
                    st.write(f"**Modality:** {study.modality}")
                    side = (study.laterality or "").upper()
                    if side and side != "NA":
                        side_label = "Right / يمين" if side == "R" else "Left / يسار" if side == "L" else side
                        st.write(f"**Side:** {side_label}")
                    if study.image_dimensions:
                        st.write(f"**Dimensions:** {study.image_dimensions}")
                with c2:
                    st.write(f"**Slices:** {study.num_slices}")
                    st.write(f"**Status:** {study.status}")
                    if study.notes:
                        st.write(f"**Notes:** {study.notes}")
                    if getattr(study, "clinical_context", None):
                        st.write(
                            f"**Clinical context:** {study.clinical_context[:200]}"
                            + ("…" if len(study.clinical_context) > 200 else "")
                        )
                with c3:
                    if study.num_slices > 0:
                        if st.button("🖥️ عرض", key=f"view_{study.id}"):
                            _open_study(study.id, "🖥️ عارض الصور")
                        if st.button("🔬 تحليل", key=f"analyze_{study.id}"):
                            _open_study(study.id, "🔬 تحليل بالذكاء الاصطناعي")
                        if st.button("💬 محادثة", key=f"chat_{study.id}"):
                            _open_study(study.id, "💬 محادثة / Q&A")
                    if st.button("🗑️ حذف", key=f"del_{study.id}"):
                        _delete_study(study.id)
                        st.rerun()

                prior = (
                    db.query(AnalysisResult)
                    .filter(AnalysisResult.study_id == study.id)
                    .order_by(AnalysisResult.created_at.desc())
                    .all()
                )
                if prior:
                    st.markdown("**📋 تحليلات سابقة / Prior analyses:**")
                    for a in prior:
                        st.write(
                            f"- {a.analysis_focus or 'Comprehensive'} "
                            f"({a.created_at.strftime('%Y-%m-%d %H:%M')})"
                        )
    finally:
        db.close()


def _open_study(study_id: int, target_page: str) -> None:
    st.session_state.selected_study_id = study_id
    st.session_state.pop("loaded_volume", None)
    st.session_state.pop("_cached_for_study", None)
    st.session_state.pop("chat_history", None)
    st.session_state.pop("last_ai_report", None)
    st.session_state.pending_nav = target_page
    st.rerun()


def _delete_study(study_id: int) -> None:
    db = SessionLocal()
    try:
        s = db.query(CTStudy).filter(CTStudy.id == study_id).first()
        if s:
            db.delete(s)
            db.commit()
            if st.session_state.get("selected_study_id") == study_id:
                _clear_study_state()
            st.success("✅ تم الحذف / Deleted")
    except Exception as e:
        db.rollback()
        st.error(f"❌ {e}")
    finally:
        db.close()


# ──────────────────────────────────────────────────────────────────
# PAGE: AI Analysis
# ──────────────────────────────────────────────────────────────────

_FS_ZERO_USAGE = {"prompt": 0, "completion": 0, "reasoning": 0, "visible": 0, "total": 0}


def _fs_reset() -> None:
    """Wipe any active full-study state machine."""
    st.session_state.pop("fs", None)


def _drive_full_study(study) -> bool:
    """One-step driver for the Full Study state machine.

    Each Streamlit rerun advances ONE step:
      step='running'      → process the next series, append partial
      step='synthesizing' → call synthesize_partial_reports
      step='done'         → render the unified report
      step='error'        → render error + accumulated partials

    Returning True means the page is fully owned by the state machine;
    the caller should NOT render the standard single-shot UI below.
    Returning False means no run is active (callers should proceed
    normally).
    """
    fs = st.session_state.get("fs")
    if not fs or fs.get("study_id") != study.id:
        return False

    total = len(fs["queue"])
    done_count = len(fs["completed"]) + len(fs["failures"])
    step = fs.get("step", "running")

    st.markdown("### 🩻 Full Study — تحليل تدريجي على مراحل")
    st.progress(min(1.0, done_count / max(total + 1, 1)))

    # Always render partials accumulated so far so the doctor sees
    # value even if the run is interrupted.
    for p in fs["completed"]:
        with st.expander(
            f"✅ {p['series_description']} ({p['plane']}) — "
            f"{p['slices_analyzed']}/{p['slices_total']} slices",
            expanded=False,
        ):
            st.markdown(
                f'<div class="report-block">{_escape(p["report"])}</div>',
                unsafe_allow_html=True,
            )
            pu = p.get("usage") or {}
            if pu.get("total"):
                p_usd, p_egp = _format_cost(pu)
                st.caption(
                    f"🧮 {pu.get('total', 0):,} tokens · "
                    f"💵 ${p_usd:.4f} ≈ {p_egp:.2f} ج.م"
                )
    for f_msg in fs["failures"]:
        st.warning(f"⚠️ {f_msg}")

    cfg = fs.get("config", {})

    if step == "running" and fs["current_index"] < total:
        s = fs["queue"][fs["current_index"]]
        description = (
            s.get("description")
            or f"Series {s.get('series_number') or fs['current_index'] + 1}"
        )
        plane = s.get("plane") or "unknown"

        with st.spinner(
            f"📡 تحليل السلسلة {fs['current_index'] + 1}/{total}: {description}…"
        ):
            db = SessionLocal()
            try:
                volume = _load_volume(
                    db, study.id, study.modality, series_uid=s["series_uid"]
                )
            finally:
                db.close()

            if volume is None or getattr(volume, "size", 0) == 0:
                fs["failures"].append(f"{description}: empty after decode")
            else:
                try:
                    sthk = float(s.get("slice_thickness") or 0) or None
                except (TypeError, ValueError):
                    sthk = None
                result = produce_report(
                    volume=volume,
                    modality=cfg.get("modality") or study.modality,
                    study_description=cfg.get("study_description", ""),
                    physician_notes=cfg.get("physician_notes", ""),
                    analysis_focus=cfg.get("focus", ""),
                    custom_task="",  # injected once in synthesis
                    slice_count=min(int(cfg.get("slice_count") or 12), int(volume.shape[0])),
                    image_plane=plane,
                    body_part=cfg.get("body_part", ""),
                    pixel_spacing=s.get("pixel_spacing", ""),
                    slice_thickness=sthk,
                    series_description=description,
                    laterality=cfg.get("laterality", ""),
                    protocol_name=s.get("protocol_name", ""),
                    clinical_context=cfg.get("clinical_context", ""),
                )
                if result.get("ok"):
                    partial = {
                        "series_description": description,
                        "plane": plane,
                        "slices_total": result.get("slices_total", 0),
                        "slices_analyzed": result.get("slices_analyzed", 0),
                        "indices": result.get("indices", []),
                        "report": result.get("report", ""),
                        "usage": result.get("usage", {}),
                    }
                    fs["completed"].append(partial)
                    for k in fs["total_usage"]:
                        fs["total_usage"][k] += int(result.get("usage", {}).get(k, 0) or 0)
                else:
                    fs["failures"].append(f"{description}: {result.get('error', 'unknown')}")

            # Free the per-series volume before the next iteration.
            del volume
            import gc; gc.collect()

        fs["current_index"] += 1
        st.rerun()

    elif step == "running" and fs["current_index"] >= total:
        # All per-series reads done; move to synthesis on the NEXT rerun
        fs["step"] = "synthesizing"
        st.rerun()

    elif step == "synthesizing":
        if not fs["completed"]:
            fs["step"] = "error"
            fs["error_msg"] = "كل السلاسل فشلت — لا يوجد شيء للتوليف."
            st.rerun()
        with st.spinner("🧠 توليف التقرير الموحَّد..."):
            cfg = fs["config"]
            syn = synthesize_partial_reports(
                partials=fs["completed"],
                modality=cfg["modality"],
                study_description=cfg["study_description"],
                physician_notes=cfg["physician_notes"],
                body_part=cfg["body_part"],
                laterality=cfg["laterality"],
                analysis_focus=cfg["focus"],
                custom_task=cfg["custom_task"],
                clinical_context=cfg.get("clinical_context", ""),
            )
        for k in fs["total_usage"]:
            fs["total_usage"][k] += int(syn.get("usage", {}).get(k, 0) or 0)
        if syn.get("ok"):
            fs["final_report"] = syn["report"]
            fs["step"] = "done"
        else:
            fs["error_msg"] = syn.get("error", "synthesis failed")
            fs["step"] = "error"
        st.rerun()

    elif step == "done":
        st.success("✅ اكتمل التحليل الكامل / Full study complete")
        report = fs.get("final_report", "")
        st.session_state.last_ai_report = report
        # Persist the synthesized report once (guard against repeated saves
        # if the doctor stays on the page).
        if not fs.get("persisted"):
            _persist_analysis(
                study_id=study.id,
                focus=f"Full study ({len(fs['completed'])} series)",
                custom_task=fs["config"].get("custom_task") or "",
                report=report,
            )
            fs["persisted"] = True
        _render_report(
            report,
            sum(p.get("slices_analyzed", 0) for p in fs["completed"]),
            sum(p.get("slices_total", 0) for p in fs["completed"]),
            [],
            study.modality,
            fs.get("total_usage") or {},
        )

    elif step == "error":
        st.error(f"❌ {fs.get('error_msg', 'unknown error')}")
        if fs["completed"]:
            st.info(
                f"📄 {len(fs['completed'])} قراءة جزئية أعلاه ما زالت متاحة. / "
                f"{len(fs['completed'])} partial reads above remain available."
            )

    if step in ("done", "error"):
        if st.button("🔄 إعادة تشغيل / Reset full-study state"):
            _fs_reset()
            st.rerun()

    return True


def show_analysis():
    st.header("🔬 تحليل بالذكاء الاصطناعي / AI Analysis")
    st.markdown(
        '<div class="pro-notice">يحلل النموذج شرائح ممثلة من الدراسة و يُخرج '
        "<strong>تقرير أشعة منظماً</strong> بأقسام Technique / Comparison / "
        "Findings / Impression. اقرأه و راجعه كما تراجع تقرير زميل قبل اعتماده. "
        '</div>',
        unsafe_allow_html=True,
    )

    db = SessionLocal()
    try:
        study = _study_picker(db)
    finally:
        db.close()
    if not study:
        return

    # If a Full-Study run is in-flight or finished, the state machine
    # owns the page. It renders progress, partials, and the unified
    # report on its own and short-circuits the standard single-shot UI.
    existing_fs = st.session_state.get("fs")
    if existing_fs and existing_fs.get("study_id") != study.id:
        # Switched studies → discard the previous run
        _fs_reset()
        existing_fs = None

    if existing_fs:
        if _drive_full_study(study):
            return

    volume = st.session_state.get("loaded_volume")
    if volume is None or volume.size == 0:
        st.error("لا يمكن فك تشفير صور هذه الدراسة. / Cannot decode study slices.")
        return

    # Pulled up so the column layout below can display series context
    # before the volume metrics. Series metadata is set by _study_picker
    # when the volume was loaded.
    series_meta = st.session_state.get("loaded_series") or {}

    st.markdown(
        f"**#{study.id}** — {study.study_description or '—'} | "
        f"**{study.modality}** | {volume.shape[0]} شريحة"
    )

    # Mode toggle: single-series (current) vs full-study (read every
    # diagnostic series and synthesize). Multi-series is the correct
    # radiological workflow when an MRI has 4-6 sequences in different
    # planes, but it costs ~5× a single read.
    full_study_available = False
    db = SessionLocal()
    try:
        _series_for_mode = _list_series_in_study(db, study.id)
        diagnostic_count = sum(
            1 for s in _series_for_mode
            if not _looks_like_localizer(s.get("description", ""), s.get("protocol_name", ""))
            and (s.get("count") or 0) >= 3
        )
        full_study_available = diagnostic_count >= 2
    finally:
        db.close()

    if full_study_available:
        mode = st.radio(
            "🩻 وضع التحليل / Analysis Mode",
            options=[
                "Single series — الحالي",
                f"Full study — حلّل كل {diagnostic_count} سلاسل و وحّد التقرير",
            ],
            index=0,
            horizontal=True,
            key="ai_mode",
            help=(
                "Single series: تحليل سلسلة واحدة فقط (السلسلة المختارة أعلاه). "
                "Full study: يحلل كل التتابعات/الإسقاطات (T1/T2/PD-FS، coronal/sagittal/axial) "
                "بشكل منفصل ثم يولّف تقرير واحد. أكثر دقة لكنه أطول و أعلى تكلفة (~5×)."
            ),
        )
        full_study = mode.startswith("Full study")
    else:
        full_study = False

    c1, c2 = st.columns(2)
    with c1:
        focus = st.selectbox(
            "تركيز التحليل / Focus",
            ["شامل / Comprehensive", "كشف الآفات / Lesion detection",
             "تحليل الكثافة / Density review", "أنسجة محددة / Specific tissue"],
            key="ai_focus",
        )
        # Slider lets the doctor decide how many slices to feed the model.
        # Per-series sweet-spot in Full Study mode is lower because each
        # series consumes its own reasoning budget — 12 covers anatomy
        # without burning through tokens.
        max_slices = min(MAX_SAMPLE_SLICES, int(volume.shape[0]))
        default_slices = min(12 if full_study else 12, max_slices)
        slice_label = (
            "عدد الشرائح لكل سلسلة / Slices per series"
            if full_study
            else "عدد الشرائح المُرسلة للتحليل / Slices to send"
        )
        slice_help = (
            "في وضع Full study: هذا الرقم يُطبَّق على كل سلسلة على حدة. "
            "ارفعه فوق 20 شريحة لكل سلسلة فقط عند الحاجة — كل زيادة "
            "تستهلك ميزانية reasoning و قد ترجع التقرير فارغاً."
            if full_study
            else (
                "النموذج يُحلّل عينة موزعة على كامل السلسلة. كل شريحة يتم "
                "ضبط نافذة عرضها تلقائياً لتفادي التشبّع. الحد الأقصى "
                f"{MAX_SAMPLE_SLICES} شريحة في طلب واحد."
            )
        )
        if max_slices <= 1:
            # Single-slice study (typical for plain radiographs, screen
            # captures, or single secondary-capture frames). Streamlit's
            # slider requires min < max, so just pin the count and let
            # the doctor know.
            slice_count = max_slices
            st.caption(
                f"📄 الدراسة شريحة واحدة فقط — سيتم تحليلها كاملة. / "
                f"Single-slice study — analyzing in full."
            )
        else:
            slice_count = st.slider(
                slice_label,
                min_value=1,
                max_value=max_slices,
                value=default_slices,
                help=slice_help,
            )
    with c2:
        # Distinguish 'this series' from 'the whole study' so the doctor
        # can see at a glance that 26 slices being analyzed is a series
        # pick, not the entire 115-slice MRI.
        whole_study = study.num_slices or volume.shape[0]
        series_label = ""
        if series_meta and series_meta.get("description"):
            series_label = f" — `{series_meta['description']}`"
        if full_study:
            est_calls = diagnostic_count + 1  # one per series + synthesis
            est_usd = est_calls * 0.05
            est_egp = est_usd * float(st.session_state.get("usd_egp_rate", DEFAULT_USD_EGP_RATE))
            st.info(
                f"**Whole study:** {whole_study} slices\n\n"
                f"**Full Study mode:** {diagnostic_count} diagnostic series\n\n"
                f"**Slices per series:** {slice_count}\n\n"
                f"**API calls:** {est_calls} (per-series + synthesis)\n\n"
                f"**Estimated cost:** ~${est_usd:.2f} ≈ {est_egp:.1f} ج.م\n\n"
                f"**Model:** `{AI_MODEL}`"
            )
            if slice_count > 20:
                st.warning(
                    f"⚠️ {slice_count} شريحة لكل سلسلة قد تستنزف ميزانية reasoning و "
                    "ترجع تقريراً فارغاً لبعض السلاسل. الموصى به: 10-15 لكل سلسلة في Full Study."
                )
        else:
            st.info(
                f"**Whole study:** {whole_study} slices\n\n"
                f"**Selected series{series_label}:** {volume.shape[0]} slices\n\n"
                f"**Sampled for read:** {slice_count} (evenly spaced)\n\n"
                f"**Auto-windowed:** 1st–99th percentile per slice\n\n"
                f"**Model:** `{AI_MODEL}`"
            )

    custom_task = st.text_area(
        "🎯 مهمة بحثية مخصصة (اختياري) / Custom research task (optional)",
        placeholder=(
            "مثال: قس قطر أكبر آفة بالمم و أعطني هيستوغرام HU للنسيج المحيط. "
            "Example: Measure the largest lesion diameter in mm and tabulate HU "
            "histogram for surrounding tissue."
        ),
        height=110,
    )

    if not st.button("🚀 توليد التقرير / Generate report", type="primary"):
        _show_last_report()
        return

    # series_meta was assigned at the top of show_analysis; re-read so
    # any picker change during the same run is honored.
    series_meta = st.session_state.get("loaded_series") or {}
    tech = _technical_context(study.id)

    effective_plane = (
        series_meta.get("plane")
        or tech.get("plane")
        or "unknown"
    )
    effective_pixel_spacing = (
        series_meta.get("pixel_spacing")
        or study.pixel_spacing
        or ""
    )
    try:
        effective_thickness = float(series_meta.get("slice_thickness") or 0) or study.slice_thickness
    except (TypeError, ValueError):
        effective_thickness = study.slice_thickness

    effective_laterality = (
        ("" if (study.laterality or "").upper() == "NA"
         else (study.laterality or ""))
        or series_meta.get("laterality")
        or tech.get("laterality", "")
    )
    effective_body_part = (
        series_meta.get("body_part")
        or tech.get("body_part", "")
    )

    if full_study:
        # Stateful, one-series-per-rerun execution. Initializing the
        # state machine here only; the actual processing happens on
        # the next rerun via _drive_full_study at the top of the page.
        # This keeps each API call inside its own Streamlit run, so
        # partials are committed to session_state immediately and a
        # WebSocket disconnect during call N doesn't lose calls 1..N-1.
        db = SessionLocal()
        try:
            full_series_list = _list_series_in_study(db, study.id)
        finally:
            db.close()
        from openai_client import is_localizer
        queue = [
            s for s in full_series_list
            if not is_localizer(s.get("description", ""), s.get("protocol_name", ""))
            and (s.get("count") or 0) >= 3
        ]
        if not queue:
            st.error(
                "❌ لا توجد سلاسل تشخيصية صالحة (كلها localizers أو شرائحها قليلة). / "
                "No diagnostic series found."
            )
            return
        st.session_state.fs = {
            "study_id": study.id,
            "queue": queue,
            "completed": [],
            "failures": [],
            "current_index": 0,
            "step": "running",
            "final_report": None,
            "total_usage": dict(_FS_ZERO_USAGE),
            "persisted": False,
            "config": {
                "modality": study.modality,
                "study_description": study.study_description or "",
                "physician_notes": study.notes or "",
                "focus": focus,
                "custom_task": custom_task.strip(),
                "slice_count": int(slice_count),
                "body_part": effective_body_part,
                "laterality": effective_laterality,
                "clinical_context": (study.clinical_context or "").strip(),
            },
        }
        st.rerun()
    else:
        with st.spinner(
            f"النموذج يحلّل {slice_count} شريحة... / Model is analyzing {slice_count} slices..."
        ):
            result = produce_report(
                volume=volume,
                modality=study.modality,
                study_description=study.study_description or "",
                physician_notes=study.notes or "",
                analysis_focus=focus,
                custom_task=custom_task.strip(),
                slice_count=slice_count,
                image_plane=effective_plane,
                body_part=effective_body_part,
                pixel_spacing=effective_pixel_spacing,
                slice_thickness=effective_thickness,
                series_description=series_meta.get("description") or "",
                # Laterality priority:
                #   1. Doctor's explicit override at upload time
                #      (study.laterality, set via the 'Side' dropdown)
                #   2. Tag on the chosen analysis series
                #   3. Cross-series aggregate from _technical_context
                laterality=effective_laterality,
                protocol_name=series_meta.get("protocol_name") or "",
                clinical_context=(study.clinical_context or "").strip(),
            )

    if not result["ok"]:
        st.error(f"❌ {result['error']}")
        # Full Study could still have produced per-series partials
        # before the synthesis step failed — surface them so the
        # doctor doesn't lose 4 expensive per-sequence reads.
        partials = result.get("partials") or []
        if full_study and partials:
            st.warning(
                f"⚠️ توليف التقرير الموحَّد فشل، لكن {len(partials)} قراءة جزئية تمّت بنجاح. "
                f"التقارير الجزئية معروضة أدناه. / "
                f"Synthesis failed, but {len(partials)} per-series reads succeeded. "
                f"Partial reads are shown below."
            )
            usage = result.get("usage") or {}
            if usage.get("total"):
                p_usd, p_egp = _format_cost(usage)
                st.caption(
                    f"💵 Tokens used so far: {usage.get('total', 0):,} · "
                    f"${p_usd:.4f} ≈ {p_egp:.2f} ج.م"
                )
            for p in partials:
                with st.expander(
                    f"📄 {p['series_description']} ({p['plane']}) — "
                    f"{p['slices_analyzed']}/{p['slices_total']} slices",
                    expanded=False,
                ):
                    st.markdown(
                        f'<div class="report-block">{_escape(p["report"])}</div>',
                        unsafe_allow_html=True,
                    )
        return

    report = result["report"]
    st.session_state.last_ai_report = report

    _persist_analysis(
        study_id=study.id,
        focus=focus,
        custom_task=custom_task.strip(),
        report=report,
    )

    _render_report(
        report,
        result.get("slices_analyzed", slice_count),
        result.get("slices_total", volume.shape[0]),
        result.get("indices", []),
        study.modality,
        result.get("usage") or {},
    )

    # For Full Study mode, expose the per-series partial reports so
    # the doctor can audit how each sequence contributed to the
    # synthesis.
    if full_study and result.get("partials"):
        with st.expander(
            f"🔍 التقارير الجزئية لكل سلسلة ({len(result['partials'])}) / "
            f"Per-series partial reads",
            expanded=False,
        ):
            for p in result["partials"]:
                st.markdown(
                    f"**{p['series_description']}** — {p['plane']} | "
                    f"{p['slices_analyzed']}/{p['slices_total']} slices"
                )
                st.markdown(
                    f'<div class="report-block">{_escape(p["report"])}</div>',
                    unsafe_allow_html=True,
                )
                pu = p.get("usage") or {}
                if pu.get("total"):
                    p_usd, p_egp = _format_cost(pu)
                    st.caption(
                        f"🧮 in: {pu.get('prompt', 0):,} · "
                        f"out: {pu.get('visible', 0):,} · "
                        f"reasoning: {pu.get('reasoning', 0):,} · "
                        f"💵 ${p_usd:.4f} ≈ {p_egp:.2f} ج.م"
                    )
                st.markdown("---")
        if result.get("failures"):
            with st.expander(
                f"⚠️ سلاسل لم تتم قراءتها ({len(result['failures'])})"
            ):
                for f_msg in result["failures"]:
                    st.write(f"- {f_msg}")


def _show_last_report():
    last = st.session_state.get("last_ai_report")
    if last:
        with st.expander("📋 آخر تقرير لهذه الجلسة / Last report this session"):
            st.markdown(f'<div class="report-block">{_escape(last)}</div>', unsafe_allow_html=True)


def _render_report(report: str, slices_analyzed: int, slices_total: int,
                   indices: list, modality: str, usage: dict | None = None) -> None:
    c1, c2, c3 = st.columns(3)
    c1.metric("Model", AI_MODEL)
    c2.metric("Slices analyzed", f"{slices_analyzed} / {slices_total}")
    c3.metric("Modality", modality)
    if indices:
        st.caption(
            "الشرائح المُحلّلة (مرقّمة من 1) / Analyzed slices: "
            + ", ".join(str(i + 1) for i in indices)
        )
    if usage:
        u1, u2, u3, u4 = st.columns(4)
        u1.metric("Input tokens", f"{usage.get('prompt', 0):,}")
        u2.metric("Output tokens", f"{usage.get('visible', 0):,}")
        u3.metric("Reasoning tokens", f"{usage.get('reasoning', 0):,}")
        u4.metric("Total tokens", f"{usage.get('total', 0):,}")
        st.caption(
            "Input = الـ prompt + الصور | Output = النص المرئي للتقرير | "
            "Reasoning = تفكير داخلي للنموذج (يُحسب مع الإخراج في ميزانية GPT-5)"
        )
        usd, egp = _format_cost(usage)
        rate = float(st.session_state.get("usd_egp_rate", DEFAULT_USD_EGP_RATE))
        cu1, cu2, cu3 = st.columns(3)
        cu1.metric("التكلفة / Cost (USD)", f"${usd:.4f}")
        cu2.metric("التكلفة / Cost (EGP)", f"{egp:.2f} ج.م")
        cu3.metric("سعر الصرف / Rate", f"{rate:.2f} EGP/USD")
        st.caption(
            "محسوبة بأسعار OpenAI الرسمية لـ GPT-5. يمكن تعديل سعر الصرف من الإعدادات. / "
            "Computed from OpenAI's published GPT-5 prices. Adjust the rate from Settings."
        )
    st.caption(
        "تقرير مولَّد آلياً للاستئناس بقراءة الطبيب. المسؤولية النهائية على الطبيب المعالج. / "
        "Machine-generated draft for the physician's review."
    )
    st.markdown("### 📊 التقرير / Report")
    st.markdown(f'<div class="report-block">{_escape(report)}</div>', unsafe_allow_html=True)
    st.download_button(
        "📥 تنزيل التقرير / Download report",
        data=report,
        file_name=f"radiology_report_{datetime.now().strftime('%Y%m%d_%H%M')}.txt",
        mime="text/plain",
    )


def _looks_like_localizer(description: str, protocol_name: str = "") -> bool:
    """Thin wrapper around openai_client.is_localizer so app.py code
    doesn't need to import the LLM module just to filter the picker."""
    from openai_client import is_localizer
    return is_localizer(description, protocol_name)


def _technical_context(study_id: int) -> dict:
    """Read scan-plane and body-part hints from the study's stored
    slice metadata. The base values come from the first slice, but
    laterality and body_part are aggregated across ALL slices in the
    whole study because they often live on a localizer series only
    (e.g. 'Loc (Right)') while the chosen analysis series is unlabelled.
    """
    db = SessionLocal()
    try:
        slices = (
            db.query(CTSlice)
            .filter(CTSlice.study_id == study_id)
            .order_by(CTSlice.slice_index)
            .all()
        )
        if not slices:
            return {}

        first = slices[0]
        base = first.extra if isinstance(first.extra, dict) else {}

        # Cross-series fallbacks: if the chosen series carries no
        # laterality / body_part, scan every other slice for a non-empty
        # value. This is what saved 'Right knee' from being reported as
        # 'side not specified' when only the localizer encoded the side.
        for key in ("laterality", "body_part"):
            if base.get(key):
                continue
            for sl in slices[1:]:
                meta = sl.extra if isinstance(sl.extra, dict) else {}
                if meta.get(key):
                    base = dict(base)  # avoid mutating the ORM JSON
                    base[key] = meta[key]
                    break
        return base
    finally:
        db.close()


def _persist_analysis(*, study_id, focus, custom_task, report):
    db = SessionLocal()
    try:
        db.add(
            AnalysisResult(
                study_id=study_id,
                model_name=AI_MODEL,
                analysis_focus=focus,
                custom_task=custom_task or None,
                report=report,
            )
        )
        db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()


def _escape(text: str) -> str:
    # Minimal HTML escape so the report doesn't accidentally inject markup.
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


# ──────────────────────────────────────────────────────────────────
# PAGE: Chat
# ──────────────────────────────────────────────────────────────────

def show_chat():
    st.header("💬 محادثة / Q&A")
    st.info(
        "ناقش الدراسة المختارة كما تناقش زميلاً. النموذج يرى شريحة وسطى مع كل سؤال. / "
        "Discuss the selected study as you would a colleague; the model sees the middle slice with each question."
    )

    db = SessionLocal()
    try:
        study = _study_picker(db)
    finally:
        db.close()
    if not study:
        return

    if "chat_history" not in st.session_state:
        st.session_state.chat_history = []

    if st.session_state.pop("_clear_chat_input", False):
        st.session_state.pop("chat_input", None)

    last_report = st.session_state.get("last_ai_report", "")
    if last_report:
        st.success(
            "✅ سيتم تضمين التقرير الأخير في الجلسة كسياق. / "
            "The last report this session will be passed as context."
        )

    for turn in st.session_state.chat_history:
        cls = "chat-user" if turn["role"] == "user" else "chat-ai"
        prefix = "👤" if turn["role"] == "user" else "🤖"
        st.markdown(
            f'<div class="{cls}">{prefix} {_escape(turn["content"])}</div>',
            unsafe_allow_html=True,
        )
        # Show per-turn token usage right under the assistant's reply.
        if turn["role"] == "assistant":
            u = turn.get("usage") or {}
            if any(u.get(k) for k in ("prompt", "visible", "reasoning", "total")):
                usd, egp = _format_cost(u)
                st.caption(
                    f"🧮 in: {u.get('prompt', 0):,} · "
                    f"out: {u.get('visible', 0):,} · "
                    f"reasoning: {u.get('reasoning', 0):,} · "
                    f"total: {u.get('total', 0):,} tokens · "
                    f"💵 ${usd:.4f} ≈ {egp:.2f} ج.م"
                )

    tally = st.session_state.get("chat_token_tally")
    if tally and tally.get("total"):
        tally_usd, tally_egp = _format_cost(tally)
        st.info(
            f"📊 إجمالي الجلسة / Session totals — "
            f"in: {tally.get('prompt', 0):,} | "
            f"out: {tally.get('visible', 0):,} | "
            f"reasoning: {tally.get('reasoning', 0):,} | "
            f"total: {tally.get('total', 0):,} tokens · "
            f"💵 ${tally_usd:.4f} ≈ {tally_egp:.2f} ج.م"
        )

    st.markdown("---")

    c_input, c_clear = st.columns([5, 1])
    with c_input:
        user_q = st.text_input(
            "اكتب سؤالك / Type your question",
            key="chat_input",
            placeholder="مثال: علّق على المنطقة المحيطة بالأذن اليمنى. / e.g., comment on the right peritemporal region.",
        )
    with c_clear:
        if st.button("🗑️ مسح / Clear"):
            st.session_state.chat_history = []
            st.session_state.pop("chat_token_tally", None)
            st.rerun()

    if st.button("📨 إرسال / Send", type="primary") and user_q.strip():
        _handle_chat(user_q.strip(), study, last_report)


def _handle_chat(question: str, study: CTStudy, last_report: str):
    history = st.session_state.chat_history
    history.append({"role": "user", "content": question})
    zero_usage = {"prompt": 0, "completion": 0, "reasoning": 0, "visible": 0, "total": 0}
    with st.spinner("النموذج يفكر... / Thinking..."):
        try:
            reply, usage = chat_about_study(
                question=question,
                history=history[:-1],
                volume=st.session_state.get("loaded_volume"),
                modality=study.modality,
                study_description=study.study_description or "",
                prior_report=last_report,
            )
        except Exception as e:
            reply = f"❌ {e}"
            usage = zero_usage
    history.append({"role": "assistant", "content": reply, "usage": usage})
    # Running token tally across the chat session for the doctor's awareness.
    tally = st.session_state.get("chat_token_tally") or dict(zero_usage)
    for k in tally:
        tally[k] = int(tally[k]) + int(usage.get(k, 0))
    st.session_state.chat_token_tally = tally
    st.session_state._clear_chat_input = True
    st.rerun()


# ──────────────────────────────────────────────────────────────────
# PAGE: Settings
# ──────────────────────────────────────────────────────────────────

def show_settings():
    st.header("⚙️ الإعدادات / Settings")

    st.subheader("🤖 OpenAI")
    st.write(f"**Model:** `{AI_MODEL}`")
    st.write(f"**Credentials:** {credentials_status()}")
    from openai_client import INPUT_PRICE_PER_M, OUTPUT_PRICE_PER_M
    st.write(
        f"**Pricing:** input ${INPUT_PRICE_PER_M:.2f}/M tokens, "
        f"output ${OUTPUT_PRICE_PER_M:.2f}/M tokens"
    )
    st.caption(
        "يعتمد النموذج حصرياً على `OPENAI_API_KEY`. أضفه في تبويب Secrets 🔒 في Replit."
    )

    st.markdown("---")
    st.subheader("💱 سعر الصرف / Currency")
    current_rate = float(st.session_state.get("usd_egp_rate", DEFAULT_USD_EGP_RATE))
    new_rate = st.number_input(
        "سعر صرف الدولار مقابل الجنيه المصري / USD → EGP rate",
        min_value=1.0,
        max_value=500.0,
        value=current_rate,
        step=0.5,
        help=(
            "يُستخدم لحساب تكلفة كل تحليل بالجنيه المصري. حدّثه يدوياً عند "
            "تغير السعر الرسمي."
        ),
    )
    if new_rate != current_rate:
        st.session_state.usd_egp_rate = float(new_rate)
        st.success(f"✅ تم التحديث إلى {new_rate:.2f} EGP/USD")

    st.markdown("---")
    st.subheader("🐛 سجل التشخيص / Debug log")
    st.caption(
        f"آخر breadcrumbs من رفع/معالجة الدراسات. الملف: `{LOG_FILE}`. "
        f"يُعاد التدوير بعد 2MB."
    )
    if st.button("🔄 تحديث / Refresh log", key="log_refresh"):
        st.rerun()
    try:
        with open(LOG_FILE, "r", encoding="utf-8", errors="replace") as fh:
            content = fh.read()
        tail = content[-15000:] if len(content) > 15000 else content
        st.text_area(
            f"آخر {min(15000, len(content))} حرف / Last "
            f"{min(15000, len(content))} chars",
            value=tail,
            height=320,
        )
        st.download_button(
            "⬇️ تحميل السجل الكامل / Download full log",
            data=content,
            file_name="ctos_debug.log",
            mime="text/plain",
        )
    except FileNotFoundError:
        st.info("لا يوجد سجل بعد / No log file yet.")

    st.markdown("---")
    st.subheader("🗄️ قاعدة البيانات / Database")
    db = SessionLocal()
    try:
        n_studies = db.query(CTStudy).count()
        n_slices = db.query(CTSlice).count()
        n_analyses = db.query(AnalysisResult).count()
    finally:
        db.close()
    c1, c2, c3 = st.columns(3)
    c1.metric("Studies", n_studies)
    c2.metric("Slices", n_slices)
    c3.metric("Analyses", n_analyses)

    st.markdown("---")
    st.subheader("ℹ️ حول / About")
    st.write(
        "**منصة تحليل الأشعة الطبية** — أداة قراءة مساعدة للطبيب. "
        "تدعم رفع CT و MRI بصيغ DICOM مباشرة أو ضمن أرشيف (.zip / .rar)، "
        "و تُولّد تقريراً منظماً بـ GPT-5 vision. القرار النهائي للطبيب المعالج."
    )


# ──────────────────────────────────────────────────────────────────
# Router
# ──────────────────────────────────────────────────────────────────

def main():
    page = _navigate()
    if page == PAGES[0]:
        show_home()
    elif page == PAGES[1]:
        show_upload()
    elif page == PAGES[2]:
        show_viewer()
    elif page == PAGES[3]:
        show_studies()
    elif page == PAGES[4]:
        show_analysis()
    elif page == PAGES[5]:
        show_chat()
    elif page == PAGES[6]:
        show_settings()


if __name__ == "__main__":
    main()
