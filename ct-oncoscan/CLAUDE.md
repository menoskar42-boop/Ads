# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Bilingual (Arabic + English) **Streamlit** app for non-diagnostic medical imaging decision support over CT and MRI DICOM studies. AI analysis runs through OpenAI GPT-5 vision via Replit AI Integrations. Persistence is PostgreSQL via SQLAlchemy.

Note: `main.py` is a leftover stub from the Replit scaffold; the actual entrypoint is `app.py`.

## Running

```bash
streamlit run app.py --server.port 5000
```

Requires env vars:
- `DATABASE_URL` — Postgres connection string (consumed in `database.py`; no fallback, app will crash on import without it).
- `AI_INTEGRATIONS_OPENAI_API_KEY` and `AI_INTEGRATIONS_OPENAI_BASE_URL` — auto-set by Replit AI Integrations; `openai_client.py` expects both.

Dependencies are managed by `uv` (`pyproject.toml` + `uv.lock`). Key libs: streamlit, pydicom, numpy, pillow, sqlalchemy, psycopg2-binary, scikit-image, scipy, openai, tenacity.

There is no test suite or linter configured.

## Architecture

Single-process Streamlit app. All UI pages live in `app.py` and are switched via sidebar radio; selected study is kept in `st.session_state` and persists across pages until explicitly cleared.

Module roles:
- `app.py` — every page (dashboard, upload, viewer, saved studies, AI analysis, chat, settings). Reads/writes DB sessions directly.
- `database.py` — SQLAlchemy engine, `SessionLocal`, `Base`, `init_db()`. Call `init_db()` once on startup to create tables.
- `models.py` — `CTStudy` → `CTSlice` (1:N, cascade delete) and `CTStudy` → `AnalysisResult` (1:N). DICOM pixel data is stored as **float32 bytes after HU rescaling** in `CTSlice.image_data` (LargeBinary); per-slice DICOM tags go into `metadata_json`. `modality` on `CTStudy` distinguishes CT vs MRI and drives viewer defaults.
- `dicom_viewer.py` — in-browser slice viewer with windowing presets (Brain/Lung/Bone/Abdomen/Soft Tissue/Liver/MRI), custom W/L, zoom, slice navigation, per-slice stats.
- `openai_client.py` — two entrypoints used by the UI:
  - `analyze_scan_with_ai()` picks ~3 representative slices, sends them as vision input to GPT-5, returns structured Arabic+English findings stored in `AnalysisResult.findings_summary` / `recommendations`.
  - `chat_about_scan()` Q&A keeping the last ~8 messages plus prior analysis as context.
- `analysis_engine.py` — legacy scikit-image-based analyzer, kept for reference; not on the main path.

## Conventions

- All user-facing strings are bilingual (Arabic first, English second). Every analysis/report surface must carry the non-diagnostic disclaimer.
- Slice pixel data must be HU-rescaled (CT) or signal-normalized (MRI) to float32 before being persisted; the viewer and AI client both assume this format.
- When adding a page, register it in the sidebar navigation in `app.py` and respect the existing `selected_study` session-state contract (set on selection, cleared on deselect or when the underlying study is deleted).
