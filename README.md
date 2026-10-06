# FinPilot — Agentic AI Finance Employee

FinPilot is a recruiter-ready React + TypeScript finance operations product designed around the ML/LLM workflow expected in modern agentic finance systems.

## What works in the live demo

- Interactive dashboard with finance KPIs
- Search and filter invoices
- Invoice investigation modal
- Deterministic multi-agent workflow with live trace states
- Research / Finance / Document / Verification / Editor agent views
- Invoice → PO → goods-received three-way matching
- Drag-and-drop document indexing demo
- Finance-policy knowledge search with source citations
- Verification evidence and risk classification
- AI-style follow-up email drafting
- Prompt evaluation dashboard
- Seeded demo data so reviewers need no account or API key
- Responsive layout
- Production build check through GitHub Actions

## Run locally

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
```

## Deploy

This is a Vite React app and can be imported directly into Vercel. Vercel supports Vite deployments and Git-connected deployments can automatically rebuild after pushes.

- Framework: Vite
- Build command: `npm run build`
- Output directory: `dist`
- No environment variables are required for demo mode.

## Architecture

The current public demo intentionally uses a deterministic browser-side service layer so a recruiter can test every workflow without an API key. The UI contracts are structured so the deterministic services can later be replaced with FastAPI + PostgreSQL/pgvector + OCR + Gemini/OpenAI/Anthropic.

## Important

The percentages shown in the Evaluation Lab are **demo benchmark values**, not claims about a production model. The product labels itself as Demo Mode to make that distinction explicit.


## Supabase setup

The app now supports a real authenticated Supabase workspace. The UI falls back to deterministic demo data when Supabase environment variables are absent.

1. Create a Supabase project.
2. Open **SQL Editor** and run [supabase/schema.sql](./supabase/schema.sql).
3. In the frontend environment, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
4. Start the app with `npm install && npm run dev`.
5. Create an account from the FinPilot sign-in screen.

The Supabase integration persists invoices, policies, workflow runs and uploaded documents. Storage uses a private `documents` bucket with per-user RLS policies.

The publishable key is safe for browser use; never put a Supabase `service_role` key in frontend code or Vite environment variables.
