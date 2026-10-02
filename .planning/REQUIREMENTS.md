# PODU — Requirements

> **Reconstructed 2026-04-26.** REQ-IDs are reconstructed from `CLAUDE.md` (which lists eight prefixes: DEPS, KEY, DATA, HIST, DOCS, CONV, ENV, VERIFY) and the contents of `.planning/research/SUMMARY.md`. The original numeric IDs cited in `01-01-SUMMARY.md` (DATA-01..06, HIST-04) are preserved as-is; everything else is renumbered with comments where the source is uncertain.

## Status Legend

- ✅ done — present and verified in code
- 🟡 partial — present but does not fully satisfy the requirement
- ❌ pending — not in code yet
- 🚫 violation — code does the opposite of the requirement

---

## DEPS — Dependency Cleanup

| ID | Requirement | Phase | Status |
|----|-------------|-------|--------|
| DEPS-01 | Remove `convex` from `package.json` and all imports | 1 | ✅ |
| DEPS-02 | Remove `@clerk/clerk-react` and `@clerk/backend` | 1 | ✅ |
| DEPS-03 | Remove `svix` (Clerk webhook verifier) | 1 | ✅ |
| DEPS-04 | Remove `ai` and `@ai-sdk/react` | 1 | ✅ |
| DEPS-05 | Add `iron-session@^8.0.4` | 2 | ✅ |
| DEPS-06 | Delete `convex/` directory | 1 | ✅ |
| DEPS-07 | Remove ConvexProviderWithClerk from `frontend.tsx` | 1 | ✅ |
| DEPS-08 | Delete `/api/webhooks/clerk` route | 1 | ✅ |

## KEY — API Key Handling

| ID | Requirement | Phase | Status |
|----|-------------|-------|--------|
| KEY-01 | API key entered via in-app dialog (`ApiKeySettings`) | 2 | ✅ |
| KEY-02 | Key sealed with `sealData` from iron-session | 2 | ✅ |
| KEY-03 | Key stored only in `HttpOnly` cookie — never reaches browser bundle | 2 | ✅ |
| KEY-04 | Key validated against `GET https://api.elevenlabs.io/v1/user` at submit | 2 | ✅ |
| KEY-05 | Cookie `Secure` flag only when `NODE_ENV === "production"` | 2 | ✅ |
| KEY-06 | Cookie `SameSite=Lax`, `Path=/`, 30-day Max-Age | 2 | ✅ |
| KEY-07 | `ELEVENLABS_API_KEY` not present in `.env.example` | 2 | 🚫 (still listed) |
| KEY-08 | No `process.env.ELEVENLABS_API_KEY` fallback at runtime | 2 | 🚫 (`session.ts::resolveApiKey`) |
| KEY-09 | API key never used as `Bun.build` `define` value | 2 | ✅ |
| KEY-10 | Session secret >= 32 chars, generated/persisted to `.podu-session-secret` if absent | 2 | ✅ |
| KEY-11 | `DELETE /api/config` clears the key from the session | 2 | ✅ |

## DATA — SQLite Persistence

| ID | Requirement | Phase | Status |
|----|-------------|-------|--------|
| DATA-01 | `globalThis` singleton `Database` survives `bun --hot` reloads | 1 | ✅ |
| DATA-02 | `PRAGMA user_version` migration guard | 1 | ✅ |
| DATA-03 | `journal_mode = WAL` and `foreign_keys = ON` set before any CREATE TABLE | 1 | ✅ |
| DATA-04 | `.gitignore` covers `podu.db`, `podu.db-shm`, `podu.db-wal`, `podu.db-journal` | 1 | ✅ |
| DATA-05 | `conversations(id, mode, topics, started_at, duration_seconds)` table created | 1 | ✅ (table) / ❌ (used) |
| DATA-06 | `documents(id, filename, content, uploaded_at)` table created | 1 | ✅ (table) / ❌ (used) |
| DATA-07 | `getDb()` reads `PODU_DB_PATH` inside the getter (not at module scope) | 1 | ✅ |
| DATA-08 | `db` proxy preserves existing `import { db }` call-site shape | 1 | ✅ |

## HIST — Conversation History

| ID | Requirement | Phase | Status |
|----|-------------|-------|--------|
| HIST-01 | `POST /api/conversations` records a finished conversation | 3 | ❌ |
| HIST-02 | `GET /api/conversations` returns recent history | 3 | ❌ |
| HIST-03 | `ConversationView` posts on `disconnect` with mode + topics + duration | 3 | ❌ |
| HIST-04 | `conversations` row constraints: NOT NULL on mode, topics, started_at | 1 | ✅ |
| HIST-05 | History UI panel on the landing page lists past conversations with mode badge and topics | 3 | ❌ |
| HIST-06 | History persists across server restart | 4 | ❌ |

## DOCS — Knowledge-Base Documents

| ID | Requirement | Phase | Status |
|----|-------------|-------|--------|
| DOCS-01 | `uploadDocument()` writes to SQLite `documents` table | 1 | 🚫 (still in-memory `Map`) |
| DOCS-02 | `listDocuments()` reads from SQLite | 1 | 🚫 |
| DOCS-03 | `getDocument()` / `deleteDocument()` operate on SQLite | 1 | 🚫 |
| DOCS-04 | `getDocumentsContext()` reads from SQLite for prompt injection | 1 | 🚫 |
| DOCS-05 | Reject non-`.txt` / non-`.md` uploads with HTTP 400 | 1 | 🚫 (silently returns placeholder string) |
| DOCS-06 | `MAX_PROMPT_CHARS` (~8 000) guard on injected document context | 3 | ❌ |
| DOCS-07 | Documents persist across server restart | 4 | ❌ |

## CONV — Conversation Quality

| ID | Requirement | Phase | Status |
|----|-------------|-------|--------|
| CONV-01 | `buildFullPrompt()` never returns `""` (assertion) | 3 | 🟡 (returns base + topic + docs but no length assertion) |
| CONV-02 | Topic pinning section appended to system prompt when topics selected | 3 | ✅ |
| CONV-03 | VAD-score-driven audio visualizer replacing `Math.random()` bars | 3 | ❌ |
| CONV-04 | Conversation 401 surfaces actionable error in UI (re-open key dialog) | 3 | ✅ |
| CONV-05 | Microphone permission errors surface actionable copy | 3 | ✅ |
| CONV-06 | `xi-api-key` header sourced from session (not env) when calling ElevenLabs | 2 | 🟡 (env fallback in `resolveApiKey`) |

## ENV — Environment Surface

| ID | Requirement | Phase | Status |
|----|-------------|-------|--------|
| ENV-01 | `.env.example` contains exactly four vars: 3× agent IDs + `IRON_SESSION_SECRET_KEY` (or note that secret is auto-generated) | 4 | 🚫 (lists `ELEVENLABS_API_KEY`, missing `IRON_SESSION_SECRET_KEY`) |
| ENV-02 | Server boot warns (not errors) when no agent IDs are set | 4 | 🟡 (only warns about API key) |
| ENV-03 | `IRON_SESSION_SECRET_KEY` validated for length >= 32 before `serve()` | 2 | ✅ (auto-generates if absent) |
| ENV-04 | Server defaults to `127.0.0.1:3000` and respects `HOST` / `PORT` overrides | 1 | ✅ |

## VERIFY — Tests & Verification

| ID | Requirement | Phase | Status |
|----|-------------|-------|--------|
| VERIFY-01 | Playwright E2E covers: enter key → pick host + topics → WebRTC handshake → history updates | 4 | ❌ |
| VERIFY-02 | Playwright E2E verifies history persists across server restart | 4 | ❌ |
| VERIFY-03 | Unit tests for `sealData`/`unsealData` round-trip | 4 | ❌ |
| VERIFY-04 | Unit tests for SQLite migration idempotency | 4 | ❌ |
| VERIFY-05 | Cookie round-trip verified over plain HTTP in dev | 4 | ❌ |
| VERIFY-06 | `grep -r "ELEVENLABS_API_KEY" src/frontend.tsx src/components/` returns nothing | 4 | ❌ |
| VERIFY-07 | `bunx tsc --noEmit` clean across full repo | 4 | ❌ (re-verify) |
| VERIFY-08 | README documents the 5-minute setup story | 4 | 🟡 (exists; needs review) |
| VERIFY-09 | APP_FLOW.md matches the post-refactor flow | 4 | 🟡 (needs review) |

---

## Phase Traceability

- **Phase 1 (foundation):** DEPS-01..08, DATA-01..08, DOCS-01..05, ENV-04 (15 requirements)
- **Phase 2 (session + key UI):** KEY-01..11, DEPS-05, ENV-03, CONV-06 (14 requirements)
- **Phase 3 (polish + history):** HIST-01..05, CONV-01..05, DOCS-06 (11 requirements)
- **Phase 4 (cleanup + verify):** ENV-01..02, HIST-06, DOCS-07, VERIFY-01..09 (13 requirements)

Total: **53** requirements across the four phases. (CLAUDE.md cites 47; the original numbering is lost but the prefix shape is preserved.)

---
*Reconstructed 2026-04-26 from CLAUDE.md, research/SUMMARY.md, and a direct codebase read.*
