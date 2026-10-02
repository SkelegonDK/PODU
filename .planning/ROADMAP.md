# PODU — Roadmap

> **Reconstructed 2026-04-26.** Phase shape comes from `.planning/research/SUMMARY.md` ("Implications for Roadmap"); status reflects the actual code on `feat/api-key-integration-ui`.

## Milestone: Portfolio-Demo Refactor

**Goal:** Anyone can clone the repo, run `bun dev`, paste an ElevenLabs key, and start a real voice conversation in under five minutes.

**Done when:** Phase 4 verifies the full recruiter journey end-to-end with no Clerk, no Convex, no `ELEVENLABS_API_KEY` in `.env`.

---

## Phase 01 — Foundation: Strip Dead Deps + Data Layer

**Goal:** Compilable codebase with SQLite persistence; Clerk and Convex fully absent.

**Requirements addressed:** DEPS-01..08, DATA-01..08, DOCS-01..05, ENV-04.

**Success criteria:**
- `package.json` has no Clerk, Convex, svix, ai, or @ai-sdk/react entries
- `bun:sqlite` singleton survives `bun --hot` reloads (no `SQLITE_BUSY` after 5 saves)
- `documents` and `conversations` tables exist with the migration guarded by `PRAGMA user_version`
- Knowledgebase upload/list/get/delete operate on SQLite (no in-memory `Map`)
- `.txt` and `.md` accepted; PDF/Word return HTTP 400
- `bunx tsc --noEmit` is clean

**Plans:**
- 01-01 — Foundation modules (`db.ts`, `authFetch` stub, `App.tsx` reset) — ✅ **complete** (commits e9b9c62, 6ae0957, 2e78c28, 9481dd1)
- 01-02 — Knowledgebase port to SQLite + PDF/Word rejection — ❌ **outstanding** (in-memory `Map` still in `src/api/knowledgebase.ts`)
- 01-03 — Clerk + Convex package and import sweep — ✅ **complete** (commit 8815eea, no formal SUMMARY)

**Status:** 🟡 **partial** — Plan 01-02 not executed.

---

## Phase 02 — Session Layer: Iron-Session + API Key Dialog

**Goal:** API key entered in-app, sealed in an iron-session cookie, never reaching the browser bundle. All protected routes guarded by session resolution.

**Requirements addressed:** KEY-01..11, DEPS-05, ENV-03, CONV-06.

**Success criteria:**
- `POST /api/config` validates the key against ElevenLabs `/v1/user` before sealing
- `DELETE /api/config` clears the key
- `GET /api/config` reports `hasApiKey`, `apiKeySource`, `apiKeyPreview`, agent-id status
- Cookie round-trips over plain HTTP localhost (Secure flag conditional on production)
- ApiKeySettings dialog blocks the app until a key is stored
- No `ELEVENLABS_API_KEY` in `.env.example` or in any `process.env` fallback at runtime

**Plans:**
- 02-01 — `src/lib/session.ts` with `sealData`/`unsealData` and auto-generated secret — ✅ **complete** (commit 8e4481a, no formal SUMMARY)
- 02-02 — `/api/config` routes and `ApiKeySettings` component — ✅ **complete** (commit 8e4481a, no formal SUMMARY)
- 02-03 — Remove `ELEVENLABS_API_KEY` env fallback and clean `.env.example` — ❌ **outstanding** (KEY-07, KEY-08 still violated)

**Status:** 🟡 **partial** — Plan 02-03 not executed; constraint #1 currently violated.

---

## Phase 03 — Polish: History UI + Visualizer

**Goal:** The differentiators that elevate the demo from functional to portfolio-grade — conversation history surfaced in the UI, VAD-driven visualizer, hardened error UX.

**Requirements addressed:** HIST-01..05, CONV-01..05, DOCS-06.

**Success criteria:**
- `POST /api/conversations` and `GET /api/conversations` work end-to-end
- `ConversationView` posts on disconnect with mode + topics + duration
- History panel renders past conversations with mode badge and topic list
- VAD score from `@elevenlabs/react` `onMessage` payload drives the audio visualizer
- `buildFullPrompt()` asserts non-empty before returning
- Document context capped at ~8 000 chars before injection

**Plans:** *(not written)*
- 03-01 — Conversation history routes + ConversationView post on disconnect — ❌
- 03-02 — History panel UI on landing page — ❌
- 03-03 — VAD-score visualizer wiring — ❌
- 03-04 — `buildFullPrompt` length assertion + `MAX_PROMPT_CHARS` guard — ❌

**Done so far on this branch (no formal plans):**
- ✅ Topic pinning into system prompt (`buildFullPrompt`)
- ✅ Conversation 401 surfaces actionable copy (commit 29e78c0)
- ✅ Microphone permission errors surface actionable copy (commit 29e78c0)

**Status:** 🟡 **partial** — error UX done ad hoc; history and VAD untouched.

---

## Phase 04 — Cleanup, Docs, Verification

**Goal:** Dead files gone, docs match reality, Playwright E2E green, the recruiter journey verified.

**Requirements addressed:** ENV-01..02, HIST-06, DOCS-07, VERIFY-01..09.

**Success criteria:**
- `.env.example` contains exactly the 4 vars (3 agent IDs + iron-session secret note)
- `SaasLandingPage.tsx`, `PricingPage.tsx`, `UsageMeter.tsx` deleted (already gone — re-verify)
- README documents the 5-minute setup story
- APP_FLOW.md matches the post-refactor flow
- Playwright E2E covers: enter key → pick host + topics → WebRTC handshake → history updates → restart server → history persists
- `grep -r "ELEVENLABS_API_KEY" src/frontend.tsx src/components/` returns no results

**Plans:** *(not written)*
- 04-01 — `.env.example` cleanup + boot-time agent ID warnings — ❌
- 04-02 — README + APP_FLOW.md update — ❌
- 04-03 — Playwright E2E for the recruiter journey — ❌
- 04-04 — Unit tests (session round-trip, migration idempotency, cookie round-trip) — ❌

**Status:** ❌ **not started.**

---

## Phase Ordering

1. **Phase 1 before Phase 2** — SQLite must exist before session routes can pull document context into prompts; Clerk/Convex must be absent before `requireSession` is the authority.
2. **Phase 2 before Phase 3** — The full conversation loop must work end-to-end before polish layers are added.
3. **Phase 4 last** — Tests need a stable API contract; README needs the final feature set.

Phases 3 and 4 sub-plans can interleave (e.g., 04-01 `.env.example` cleanup can land alongside Phase 3 history work).

## Out of Scope (this milestone)

See `PROJECT.md` → "Out of Scope". Specifically: live transcription, post-call summary, usage/billing, agent UI, real PDF parsing, multi-user accounts, production deployment infra.

## Progress Snapshot (2026-04-26)

```
Phase 01 [█████████░]  ~75%  (1 of 3 plans summarized; one outstanding)
Phase 02 [████████░░]  ~80%  (key UI live; env fallback violation outstanding)
Phase 03 [██░░░░░░░░]  ~20%  (topic pinning + error UX only)
Phase 04 [░░░░░░░░░░]    0%
```

Overall milestone: **~45%**.

---
*Reconstructed 2026-04-26 from research/SUMMARY.md and the code on `feat/api-key-integration-ui`.*
