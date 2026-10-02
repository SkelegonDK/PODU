# PODU — State

> Reconstructed 2026-04-26 after planning files were lost. Current position is read off the live `feat/api-key-integration-ui` branch and git history.

## Project Reference

- **Building:** Interactive AI podcast demo — clone, paste an ElevenLabs key, talk to a host within 5 minutes.
- **Milestone:** Portfolio-demo refactor — Clerk + Convex out, `bun:sqlite` + iron-session in.
- **Core value:** Single-key, single-binary, single-file-DB setup.

## Current Position

- **Branch:** `feat/api-key-integration-ui`
- **Active phase:** Phase 02 (session layer) — bulk landed, key constraint violation outstanding
- **Next planned phase:** Phase 03 (history + VAD visualizer), pending Phase 02-03 cleanup

## Progress

```
Phase 01 [█████████░]  ~75%  (DEPS + Foundation modules done; knowledgebase port outstanding)
Phase 02 [████████░░]  ~80%  (key UI works; env-var fallback violates constraint #1)
Phase 03 [██░░░░░░░░]  ~20%  (topic pinning + error UX done ad hoc)
Phase 04 [░░░░░░░░░░]    0%
Overall: ~45%
```

## Recent Activity

| Date | Commit | What Happened |
|------|--------|----------------|
| 2026-04-23 | 9481dd1 | Phase 01-01 plan complete: SQLite singleton + authFetch stub + App.tsx reset |
| 2026-04-23 | 8815eea | Clerk + Convex packages and imports stripped from main (no formal plan) |
| 2026-04-24 | 8e4481a | API key dialog + iron-session + `/api/config` routes (no formal plan) |
| 2026-04-26 | 29e78c0 | ConversationView error UX — actionable 401 / mic permission copy |

## Recent Decisions

- **Decision (Phase 02):** Use `sealData`/`unsealData` directly; the higher-level `getIronSession` is incompatible with Bun's immutable `Response`. *(Followed.)*
- **Decision (Phase 02):** Auto-generate `IRON_SESSION_SECRET_KEY` to `.podu-session-secret` (chmod 600) if neither env var nor file is set. *(Followed.)*
- **Decision (Phase 01-01):** `db` is a `Proxy({}, { get })` over `getDb()` so existing call sites keep working without eager init. *(Followed.)*
- **Decision (carried):** `.txt` and `.md` only for uploads this milestone. *(Not yet enforced — current code returns placeholder strings for PDF/Word.)*

## Pending Work (highest priority first)

1. **Phase 02-03 — Constraint #1 violation.**
   - `.env.example` still lists `ELEVENLABS_API_KEY=your_elevenlabs_api_key`.
   - `src/lib/session.ts::resolveApiKey()` falls back to `process.env.ELEVENLABS_API_KEY`.
   - The whole point of the milestone is that the key never lives in `.env`.
2. **Phase 01-02 — Knowledgebase port.**
   - `src/api/knowledgebase.ts` still uses an in-memory `Map<string, Document>`.
   - Server restart wipes uploaded documents.
   - PDF/Word silently return placeholder text instead of HTTP 400.
3. **Phase 03 — History.**
   - `conversations` table exists but no `/api/conversations` routes.
   - `ConversationView` doesn't POST on disconnect.
   - No history panel in the UI.
4. **Phase 03 — VAD visualizer.**
   - Audio bars still driven by `Math.random()` (verify before fixing).
5. **Phase 04 — Verification.**
   - No Playwright E2E for the new flow.
   - No unit tests for session round-trip or migration idempotency.

## Pending Todos / Ideas

- (none captured in conversation context yet)

## Blockers / Concerns Carried Forward

- **C-01 (security):** `process.env.ELEVENLABS_API_KEY` fallback in `resolveApiKey()` plus its presence in `.env.example` together undo constraint #1. Removing the fallback may break any local dev habit of using a `.env` key — verify nothing is relying on it before changing.
- **C-02 (data loss):** Document uploads vanish on server restart because `knowledgebase.ts` is in-memory. Demos that upload a doc and then bounce the server will surprise the recruiter.
- **C-03 (silent corruption):** PDF/DOCX uploads currently inject literal placeholder strings (`[PDF content from … - PDF parsing not yet implemented]`) into the system prompt — agents will react to that text.
- **C-04 (planning drift):** Three commits (8815eea, 8e4481a, 29e78c0) landed without phase plans or SUMMARY artifacts. Backfill SUMMARY files (see "Session Continuity" below).

## Session Continuity

- **Resumed:** 2026-04-26 from missing-state checkpoint.
- **Worktrees:** `.claude/worktrees/` is untracked — present but empty of meaningful state for this resume.
- **Backfill status:** PROJECT.md, REQUIREMENTS.md, ROADMAP.md, STATE.md reconstructed this session. Phase SUMMARY backfill for the three plan-less commits (Clerk/Convex strip, API key UI, error UX) is pending — recommended next move is to either (a) write retroactive SUMMARY files now while context is fresh, or (b) define Phase 02-03 and Phase 01-02 as the next plans and let those naturally re-document the boundary.

## Suggested Next Action

Two reasonable paths:

1. `/gsd-plan-phase 1` — formalize **Plan 01-02 (Knowledgebase → SQLite)** as the next executable unit; small surface, unblocks DOCS-* requirements.
2. `/gsd-plan-phase 2` — formalize **Plan 02-03 (kill `ELEVENLABS_API_KEY` env fallback + clean `.env.example`)** as the next executable unit; small but it's a constraint violation that should not linger.

I'd start with **(2)** — it's smaller, it's a security constraint, and it's the kind of thing that's easy to forget if the milestone declares "done".

---
*Reconstructed 2026-04-26.*
