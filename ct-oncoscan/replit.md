# منصة تحليل الأشعة الطبية - Medical Imaging Analysis Platform

## Overview
A comprehensive medical imaging analysis platform supporting both **CT scans** and **MRI** studies. Provides **non-diagnostic decision support** for medical professionals with AI-powered analysis and interactive Q&A.

## Current State
- **Version**: 2.0.0
- **Status**: Fully functional
- **Modalities**: CT (Computed Tomography) + MRI (Magnetic Resonance Imaging)
- **Language**: Bilingual Arabic + English

## Key Features
1. **Multi-modality DICOM Upload**: CT and MRI files, multi-slice support
2. **In-Browser Medical Image Viewer**: Built-in DICOM viewer with:
   - Windowing presets (Brain, Lung, Bone, Abdomen, Soft Tissue, Liver, MRI)
   - Custom window center/width controls
   - Zoom controls (0.5x to 2.0x)
   - Slice navigation with thumbnail strip
   - Per-slice statistics (HU for CT, signal for MRI)
3. **OpenAI GPT-5 Vision Analysis**: AI-powered image analysis via Replit AI Integrations
   - Sends representative slices to GPT-5 for visual analysis
   - Returns structured medical observations in Arabic + English
   - Downloadable PDF-format text reports
4. **Interactive Chat / Q&A**: Ask questions about uploaded studies
   - Maintains conversation history (last 8 messages)
   - Uses study context + prior analysis as context
   - Suggested questions for quick start
5. **PostgreSQL Database Storage**: Indexed studies, slices, and analysis results
6. **Non-diagnostic Disclaimers**: Throughout every page and report

## Project Structure
```
├── app.py                 # Main Streamlit application (all pages)
├── openai_client.py       # OpenAI GPT-5 integration for analysis & chat
├── dicom_viewer.py        # In-browser DICOM/MRI viewer component
├── database.py            # PostgreSQL connection and session management
├── models.py              # SQLAlchemy models (CTStudy, CTSlice, AnalysisResult)
├── analysis_engine.py     # Legacy scikit-image analyzer (kept for reference)
├── .streamlit/
│   └── config.toml        # Streamlit configuration
└── replit.md              # This file
```

## Navigation Pages
- **🏠 الرئيسية** - Dashboard with stats
- **📤 رفع دراسة جديدة** - Upload CT/MRI DICOM files
- **🖥️ عارض الصور** - In-browser DICOM viewer with windowing
- **📊 الدراسات المحفوظة** - Browse/manage saved studies
- **🔬 تحليل بالذكاء الاصطناعي** - OpenAI GPT-5 vision analysis
- **💬 محادثة / Q&A** - Interactive chat about studies
- **⚙️ الإعدادات** - Settings and system info

## Database Models
- **CTStudy**: Study metadata (patient_id, modality, study_date, num_slices, etc.)
- **CTSlice**: Individual DICOM slices (image_data as float32 bytes, metadata_json)
- **AnalysisResult**: AI analysis results with findings_summary and recommendations

## OpenAI Integration
- Uses **Replit AI Integrations** (no personal API key needed, billed to Replit credits)
- Model: **GPT-5** with vision capabilities
- Environment variables auto-set: `AI_INTEGRATIONS_OPENAI_API_KEY`, `AI_INTEGRATIONS_OPENAI_BASE_URL`
- Functions in `openai_client.py`:
  - `analyze_scan_with_ai()`: Sends 3 representative slices for structured analysis
  - `chat_about_scan()`: Interactive Q&A with conversation history

## Running the Application
```bash
streamlit run app.py --server.port 5000
```

## Dependencies
- streamlit
- pydicom
- numpy
- pillow
- sqlalchemy
- psycopg2-binary
- scikit-image
- scipy
- openai
- tenacity

## Important Notes
- **Non-diagnostic**: All results are for decision support only, must be reviewed by qualified medical professionals
- **Bilingual**: All UI elements in Arabic + English
- **Image storage**: Pixel data stored as float32 bytes after HU rescaling
- **Session state**: Selected study persists across pages; cleared on study change or manual deselect
