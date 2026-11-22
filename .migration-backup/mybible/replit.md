# Bible Companion App (رفيق الكتاب المقدس)

## Overview

A full-stack Arabic Bible companion web application designed to encourage daily reading, provide spiritual comfort, and facilitate Bible study. The app uses a hybrid AI model, offering basic features to free users and advanced AI capabilities to premium subscribers. It respects the Bible as sacred text, focusing on understanding, categorization, and intelligent search rather than generating biblical content. The project aims to provide comprehensive Orthodox Christian resources, enhance user engagement through behavioral SEO, and offer a rich, accessible experience for Arabic-speaking users.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter
- **State Management**: TanStack React Query
- **UI Components**: shadcn/ui (Radix UI primitives)
- **Styling**: Tailwind CSS (custom Arabic-friendly design)
- **Animations**: Framer Motion
- **Build Tool**: Vite
- **UI/UX**: RTL support, dark mode, mobile-first responsive design, session-based anonymous users.

### Backend
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript (ESM modules)
- **Session Management**: express-session (cookie-based)
- **API Design**: RESTful endpoints
- **Authentication**: Session-based anonymous users with premium upgrade path.

### Data Storage
- **Database**: PostgreSQL (via Drizzle ORM)
- **Schema**: `shared/schema.ts`
- **Migrations**: Drizzle Kit.
- **Key Tables**: Users, Bible content, reading plans, user progress, AI usage logs, reading groups, church management, page metrics, page scores.

### AI Service
- **Model**: Hybrid (local rule-based for common queries, external AI for complex requests).
- **Functionality**: Primarily for understanding, categorization, and intelligent search. AI never generates biblical content; it only helps with understanding and search.

### Tafsir Extraction
- Extracts per-verse commentary from shared chapter blobs, navigating hierarchical structures to provide specific content.

### Behavioral SEO Optimization
- Tracks user engagement (time on page, scroll depth, clicks) via `usePageTracker` hook.
- Pages are scored based on engagement, influencing sitemap priority and trending content displays.

### Viral Loop System
- Features shareable verse pages (`/share/verse/:id`) with smart links, OpenGraph SEO support for social media, auto-branding, and engagement loops to drive users deeper into the app.

### Exit Intelligence System
- Detects and classifies exit reasons (`weak_intro`, `boring_content`, `missing_target`, `normal_exit`) using `exit_events` and `page_issues` tables.
- `useExitTracker` hook records events, and `usePageOptimizations` fetches issues to inform auto-optimizations (e.g., reordering sections on the homepage).
- Provides an admin dashboard for insights and optimization suggestions.

### Orthodox Section
- A dedicated section (`/orthodox`) providing resources like daily Synaxarium, Agpeya prayers, liturgies, deacon responses, Coptic hymns, Katameros, and lives of saints and martyrs.
- **Interactive Bible Map**: Uses Leaflet.js with OpenStreetMap tiles to display 42 Bible locations with Arabic names, descriptions, and verse references. Filterable by testament and category.
- **Pope Shenouda Q&A**: Curated YouTube Q&A videos with Arabic questions and expandable answers.
- **Saints & Martyrs Embedded Library**: Fully embedded Arabic biographies of major Coptic saints and martyrs from the Coptic Synaxarium.
- **Embedded Commentary Library**: Fully embedded Arabic text of Bible commentaries from ancient Church Fathers (John Chrysostom, Cyril of Alexandria, Athanasius, Basil the Great, Origen).
- **Embedded Agpeya Library**: Fully embedded Arabic text of all 7 Agpeya prayer hours.
- **Embedded Liturgy Library**: Fully embedded Arabic text of the three Coptic Orthodox liturgies (St. Basil, St. Gregory, St. Cyril/Mark).
- **Embedded Orthodox Book Library** (`client/src/lib/orthodox-books-content.ts`): Fully embedded Arabic Orthodox books — no external links. 9 books total: Didache, Sayings of the Desert Fathers, Letters of Ignatius, Epistle of Barnabas, Spiritual Meadow, De Incarnatione (Athanasius), 1 Clement, Epistle to Diognetus, Life of St. Antony (Athanasius). All public domain (1st–4th century). The "كتب" tab in `/orthodox` uses this embedded reader exclusively — the old external-link buttons (st-takla.org, coptic-treasures.com) have been removed. The standalone "مكتبة" tab was merged into "كتب".
- **Embedded Katameros Library** (`client/src/lib/katameros-content.ts`): Fully embedded Arabic daily lectionary readings — no external links. Covers 4 liturgical seasons (أسبوع الآلام, الصوم الكبير, خمسينية القيامة, أيام السنة). Each day has 5 readings (مزمور، رسالة بولس، كاثوليكون، إبركسيس، إنجيل) with complete Arabic text from the Van Dyke 1865 Bible (public domain). Three-level navigation: Season → Day → expandable readings.
- **Embedded Hymns Library** (`client/src/lib/hymns-content.ts`): Fully embedded Arabic Coptic hymns — no external links. Covers 5 categories (التسبحة/القداس/كيهك/الآلام/القيامة) with complete Arabic liturgical text from the public-domain Coptic Orthodox tradition. Three-level navigation: Category → Hymn → expandable text sections.
- **Liturgy Presentation System** (`client/src/lib/liturgy-map.ts`, `client/src/pages/LiturgyControl.tsx`, `client/src/pages/LiturgyDisplay.tsx`): Church presentation system for displaying liturgy slides on a screen. Control panel at `/liturgy-control` manages switching between the 3 liturgies (Basil/Gregory/Cyril) with unified section keys, slide navigation, and deacon response injection. Display screen at `/liturgy-display` shows full-screen text (no UI). Backend session synced via `GET/POST /api/liturgy-session` with 1-second polling. Entry point: "نظام عرض القداس" card in the Liturgy tab of `/orthodox`.
- **Deuterocanonical Books Reader** (`client/src/lib/apocrypha-content.ts`): Fully embedded Arabic text of the 10 Deuterocanonical books accepted by the Coptic Orthodox Church (طوبيا، يهوديت، حكمة سليمان، يشوع بن سيراخ، باروخ، المكابيين الأول/الثاني/الثالث، المزمور 151، صلاة منسى). Displayed in the "أسفار مخفية" tab in `/orthodox` using the exact same UI as the Bible reader (book grid → chapter grid → verse reader). Each verse has a "تفسير" button linked to the existing `fetchVerseTafsir`/`fetchChapterTafsir` tafsir system. Source: Arabic Van Dyck Bible 1865 (public domain).

### SEO Implementation
- Dynamic meta tags via `SEOHead` component.
- Bot snapshot middleware for static HTML snapshots for bots.
- Dynamic sitemap generation with priorities based on behavioral SEO scores.
- Structured data (JSON-LD) for various content types.
- Descriptive Arabic alt text for all images.

## External Dependencies

### Database
- **PostgreSQL**: Primary database.
- **Drizzle ORM**: Type-safe ORM for PostgreSQL.

### AI Services
- **Google Generative AI** (`@google/generative-ai`): For premium AI features.
- **OpenAI**: Alternative AI provider.
- **Groq (llama-3.1-8b-instant)**: Used for Emotions AI (mood classification) and AI-Enhanced Search.

### Frontend Libraries
- **Radix UI**: Accessible UI component primitives.
- **Embla Carousel**: Touch-friendly carousels.
- **React Day Picker**: Calendar component.
- **Recharts**: Data visualization.
- **Leaflet** (`leaflet` + `@types/leaflet`): Interactive Bible map.

### Session & Security
- **express-session**: Server-side session management.
- **connect-pg-simple**: PostgreSQL session store.
- **memorystore**: In-memory session store (development).

### Daoud Lamei Lessons Feature
- **YouTube RSS Feed**: Fetches lesson videos.

### Orthodox Section Data Sources
- **copticchurch.net/synaxarium**: Source for daily Synaxarium.
- **st-takla.org, coptic-treasures.com, copticwave.org, tasbeha.org, agpeya.org, katameros.app, avabishoy.com, orsozox.com, ayakolyoum.com**: Various websites linked for Orthodox content.