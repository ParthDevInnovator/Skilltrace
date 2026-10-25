# Mosaic — Beyond the Resume

AI-powered candidate intelligence platform that consolidates fragmented candidate information into a unified, evidence-backed profile.

---

## Architecture Overview

- **Frontend:** React 19, TypeScript, Vite, Vanilla/Modern CSS with accessible design tokens.
- **Backend:** Python 3.12, FastAPI, Pydantic v2, Uvicorn.
- **Data & Ingestion:** Disk-backed mock seed stores $\to$ External Signal Fetchers (GitHub, LinkedIn, LeetCode) $\to$ Deterministic Evidence Scoring Engine.

---

## Quick Start

### 1. Prerequisites
- **Node.js:** v18+ (tested on v24)
- **Python:** 3.11+ (tested on 3.12)

### 2. Initial Setup
The project uses a Python virtual environment in `.venv/` and Node dependencies in root and `frontend/`.

```powershell
# 1. Python virtual environment (if not already created)
python -m venv .venv
.\.venv\Scripts\pip install -r backend\requirements.txt

# 2. Node dependencies
npm install
npm --prefix frontend install
```

### 3. Run Development Servers
Start both backend (FastAPI) and frontend (Vite) concurrently with a single command:

```powershell
# Via npm
npm run dev

# Or via PowerShell script
.\dev.ps1
```

- **Frontend UI:** [http://localhost:5173](http://localhost:5173)
- **FastAPI Documentation (Swagger):** [http://localhost:8000/docs](http://localhost:8000/docs)
- **Service Health Check:** [http://localhost:8000/health](http://localhost:8000/health)

---

## Available Scripts

| Script | Command | Description |
| :--- | :--- | :--- |
| `npm run dev` | `concurrently ...` | Runs backend & frontend servers concurrently |
| `npm run dev:backend` | `uvicorn backend.main:app ...` | Runs FastAPI server with auto-reload on port 8000 |
| `npm run dev:frontend` | `npm --prefix frontend run dev` | Runs Vite dev server on port 5173 |
| `npm run build:frontend` | `npm --prefix frontend run build` | Compiles TypeScript and builds production frontend bundle |
| `npm run test:backend` | `pytest backend/tests` | Runs backend unit and integration test suite |

---

## Project Structure

```text
├── backend/
│   ├── config.py           # Application settings via pydantic-settings
│   ├── main.py             # FastAPI app with CORS, lifespan & error handling
│   ├── models/             # Pydantic schemas (Job, CandidateSummary, etc.)
│   ├── routers/            # API endpoints (health, jobs, candidates)
│   ├── services/           # Business logic & seed loaders
│   ├── tests/              # Backend test suite (pytest + httpx)
│   ├── requirements.txt    # Python dependencies
│   └── pyproject.toml      # Python packaging configuration
├── frontend/
│   ├── src/
│   │   ├── components/     # UI components (dashboard, cards, layout, common)
│   │   ├── context/        # React contexts (ThemeContext, JobContext)
│   │   ├── services/       # Typed API client
│   │   ├── types/          # TypeScript interface definitions
│   │   ├── App.tsx         # Main application shell
│   │   └── index.css       # Design tokens & modern CSS system
│   ├── package.json        # Frontend dependencies
│   ├── tsconfig.json       # TypeScript configuration with @/* aliases
│   └── vite.config.ts      # Vite configuration & dev proxy
├── .env.example            # Environment template
├── dev.ps1                 # PowerShell startup script
└── package.json            # Root workspace scripts & tooling
```
