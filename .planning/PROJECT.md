# PODU — Project

> **Reconstructed 2026-04-26.** Original PROJECT.md was lost; this version is rebuilt from `CLAUDE.md`, `.planning/research/SUMMARY.md`, and a direct read of the codebase on the `feat/api-key-integration-ui` branch.

## What This Is

PODU is an interactive AI podcast web app. A recruiter clones the repo, runs `bun dev`, enters their ElevenLabs API key in-app, and has a real-time voice conversation with one of three AI podcast hosts (fun / educational / deep) on topics they choose.

The app's job is to be a five-minute, single-key portfolio demo — clone → `bun dev` → conversation. Every architectural decision is subordinate to that constraint.

## Current Milestone

**Portfolio-demo refactor** — strip Clerk + Convex, replace with `bun:sqlite` + `iron-session`. The app must run with only an ElevenLabs API key and SQLite's local file. No external services, no auth provider, no BaaS.

## Core Value

> A recruiter clones the repo, runs `bun dev`, pastes their ElevenLabs key into an in-app dialog, picks a host and a topic, and is in a real voice conversation in under five minutes.

## Active Requirements (this milestone)

Grouped by REQ-ID prefix. See `REQUIREMENTS.md` for full specs.

- **DEPS** — Remove Clerk, Convex, svix, ai, @ai-sdk/react; add iron-session; bun:sqlite is built-in.
- **KEY** — API key entered in-app, sealed via iron-session, stored only in httpOnly cookie. Never in `.env`, never in browser bundle.
- **DATA** — `bun:sqlite` singleton on `globalThis`, WAL mode, PRAGMA user_version migration, `documents` and `conversations` tables.
- **HIST** — Conversation history persisted (mode, topics, started_at, duration_seconds) and surfaced in UI.
- **DOCS** — Knowledge-base documents persisted in SQLite. Accept `.txt` and `.md` only this milestone.
- **CONV** — Topic pinning wired into system prompt. `buildFullPrompt()` never returns empty. VAD-score-driven audio visualizer.
- **ENV** — Four vars only: three `ELEVENLABS_AGENT_ID_*` plus `IRON_SESSION_SECRET_KEY` (or auto-generated `.podu-session-secret`). No `ELEVENLABS_API_KEY` in `.env`.
- **VERIFY** — Playwright E2E for the recruiter journey; unit tests for session and persistence; full visual polish (Aurora, LightRays, mode-color theming, reduced-motion) preserved.

## Validated Requirements

These are confirmed working on the `feat/api-key-integration-ui` branch:
- Clerk + Convex packages and imports gone
- `bun:sqlite` singleton with lazy `getDb()` and migration in place
- iron-session `sealData`/`unsealData` working over Bun's immutable Response
- In-app API key dialog with validation against ElevenLabs `/v1/user`
- Topic pinning in system prompt
- Reduced-motion preservation

## Out of Scope (this milestone)

- Live transcription (no real-time word stream from ElevenLabs SDK)
- Post-call summary (would require a second LLM key)
- Usage tracking, billing, paid plans
- Agent configuration UI (managed in ElevenLabs dashboard)
- Production deployment infra (canonical interface is local `bun dev`)
- Real PDF / Word parsing (deferred to v1.x)
- URL-param or localStorage API key storage (security anti-pattern, explicitly rejected)
- Multi-user accounts (single-user demo by design)

## Hard Constraints

These are easy to get wrong; see `.planning/research/PITFALLS.md`:

1. `ELEVENLABS_API_KEY` must never appear in `.env`, `Bun.build` `define`, or any client bundle. Server-only, in the encrypted cookie.
2. SQLite connection lives on `globalThis` (Bun `--hot` re-evaluates module scope on every save).
3. Use `sealData` / `unsealData` from iron-session, **not** `getIronSession` (Bun's `Response` is immutable).
4. Remove Clerk + Convex packages **before** deleting their imports — let TypeScript surface every orphan.
5. `buildFullPrompt()` must never return `""` — ElevenLabs silently discards empty overrides.
6. Cookie `secure: true` only when `NODE_ENV === "production"` — otherwise localhost over plain HTTP silently 401s.

## Stack

- **Runtime:** Bun v1.1+
- **Frontend:** React 19, TypeScript strict, Tailwind 4, Shadcn/UI
- **Voice:** ElevenLabs Conversational AI (WebRTC) — `@elevenlabs/react`
- **Persistence:** `bun:sqlite` (single file, no ORM)
- **Session:** `iron-session` cookie for the API key

## Key Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Replace Clerk auth with iron-session cookie holding only the API key | Single-key recruiter setup; no auth provider sign-up needed. |
| 2 | Replace Convex with `bun:sqlite` (raw SQL, no ORM) | Zero external services; SQLite is built into Bun; raw SQL is sufficient for two tables. |
| 3 | Lazy `getDb()` reading `process.env.PODU_DB_PATH` inside the getter | Tests can override the env var before importing the module without racing ES-module hoisting. |
| 4 | `db` exported as a `Proxy({}, { get })` over `getDb()` | Existing `import { db } from "../lib/db"; db.query(...)` call sites work unchanged. |
| 5 | Use `sealData`/`unsealData` instead of `getIronSession` | Bun's `Response` is immutable; the higher-level API mutates response headers and breaks. |
| 6 | Cookie `Secure` flag conditional on `NODE_ENV === "production"` | Browsers refuse `Secure` cookies over plain-HTTP localhost — silent 401 loops otherwise. |
| 7 | API key validated against ElevenLabs `/v1/user` at submit | Bad keys surface at setup, not mid-conversation as a cryptic WebRTC error. |
| 8 | `.txt` + `.md` only for document upload | PDF/Word parsing deferred; current placeholder strings would silently corrupt prompts. |
| 9 | Keep `agentPrompts.ts` as-is | The three host personalities are the portfolio differentiator. |
| 10 | Build order: SQLite → session → frontend gate → cleanup | Prevents a window where the app is broken for both old and new reasons. |

## Open Concerns Carried Forward

These are deviations between the plan and the current branch. They live in `STATE.md` for the next phase to address.

1. `.env.example` still lists `ELEVENLABS_API_KEY` (constraint #1 violation).
2. `src/lib/session.ts::resolveApiKey()` falls back to `process.env.ELEVENLABS_API_KEY` (constraint #1 violation).
3. `src/api/knowledgebase.ts` still uses an in-memory `Map<string, Document>` — DOCS requirements not met.
4. No `/api/conversations` routes; conversation history table exists but is unused — HIST requirements not met.
5. PDF/Word upload returns placeholder strings instead of returning HTTP 400 — silent corruption risk.

---
*Reconstructed 2026-04-26 from CLAUDE.md and research/SUMMARY.md.*
