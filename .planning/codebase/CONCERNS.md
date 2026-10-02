# Codebase Concerns

**Analysis Date:** 2026-04-21

## Tech Debt

**Duplicate server implementations — Bun server vs Vercel `/api` routes:**
- Issue: The same HTTP endpoints are implemented twice: once inline inside the Bun server at `src/index.ts` (lines 78-372) and once as Vercel-style handlers under `api/` (`api/agents/index.ts`, `api/agents/[agentId]/conversation-token.ts`, `api/usage/index.ts`, `api/usage/record.ts`, `api/documents/index.ts`, `api/documents/[id]/index.ts`, `api/webhooks/clerk.ts`, `api/webhooks/elevenlabs.ts`, `api/health.ts`).
- Files: `src/index.ts`, `api/**`
- Impact: Two sources of truth for auth, validation, and webhook logic. Fixing a bug in one path can silently leave the other vulnerable. The clerk webhook in `src/index.ts` verifies Svix signatures; changes to verification rules must be made in two places.
- Fix approach: Extract route handlers into shared functions (one per endpoint) called from both entrypoints, or commit to a single deployment target (Bun-on-Vercel custom runtime vs. Vercel serverless) and delete the other.

**Duplicate Clerk middleware — `requireAuth` defined twice:**
- Issue: `requireAuth` exists in both `api/_lib/auth.ts` (lines 14-40) and `src/index.ts` (lines 63-69). They have slightly different shapes (the Bun one calls an internal `authenticateRequest`).
- Files: `api/_lib/auth.ts`, `src/index.ts`
- Impact: Divergence risk; one may be hardened while the other is not.
- Fix approach: Export a single `requireAuth` from `api/_lib/auth.ts` (or move to `src/lib/requireAuth.ts`) and import everywhere.

**Duplicate plan limits tables:**
- Issue: `PLAN_LIMITS` is declared in both `convex/users.ts` (lines 5-10) and `src/api/usage.ts` (lines 19-24) with the same data. Drift is inevitable.
- Files: `convex/users.ts`, `src/api/usage.ts`
- Impact: Server-side limit checks can disagree with Convex-side quota calculations if one is updated.
- Fix approach: Move `PLAN_LIMITS` to a single shared module imported by both (e.g., `src/lib/planLimits.ts`) or read it exclusively from Convex.

**Duplicate Convex client factory:**
- Issue: The same `getConvexClient()` lazy singleton is duplicated in `src/api/usage.ts` (lines 6-16) and `src/api/billing.ts` (lines 6-16).
- Files: `src/api/usage.ts`, `src/api/billing.ts`
- Fix approach: Export a single shared `getConvexClient` from `src/lib/convexClient.ts`.

**In-memory knowledgebase storage:**
- Issue: `src/api/knowledgebase.ts` line 12 stores documents in a `new Map<string, Document>()` at module scope. On Vercel serverless this map resets per cold start and is not shared between instances; even on a long-lived Bun server it is global (not per-user).
- Files: `src/api/knowledgebase.ts`
- Impact: Documents silently disappear on deploy/restart. Every authenticated user sees the same global knowledgebase (no per-user scoping in the API).
- Fix approach: Persist uploads in Convex (new `documents` table keyed by `clerkId`) or a blob store. Scope queries/deletes by `auth.userId`.

**Stale `.env.example` — `IRON_SESSION_SECRET_KEY` no longer used:**
- Issue: `.env.example` line 3 requests `IRON_SESSION_SECRET_KEY`. Iron session was replaced by Clerk; no reference remains in the codebase.
- Files: `.env.example`
- Fix approach: Remove the variable from `.env.example`.

**`vercel.json` rewrites are incomplete for the `api/` tree:**
- Issue: `vercel.json` rewrites `/api/(.*)` → `/api/$1` (a no-op) and everything else to `/index.html`. The rewrite rule does not invoke the Bun server; Vercel will look for files under `api/` directly.
- Files: `vercel.json`
- Impact: Routes defined only in `src/index.ts` (e.g., the `/frontend.tsx` transpile endpoint) will 404 in production on Vercel. This likely explains why duplicate handlers exist under `api/`.
- Fix approach: Either deploy `src/index.ts` as the single serverless entry (re-route `/api/(.*)` → `src/index.ts`) or keep the `api/` split and delete the Bun-only handlers in `src/index.ts`.

**`build.ts` and `bunfig.toml` not audited for production parity:**
- Issue: `npm run build` → `bun run build.ts`; on Vercel the built `dist/` is served statically while the API tree is expected to be serverless. Cold-start behavior of `ConvexHttpClient` singletons under Vercel has not been verified.
- Files: `build.ts`, `vercel.json`, `src/api/usage.ts`, `src/api/billing.ts`
- Fix approach: Document deployment target clearly and add a smoke-test deploy.

## Known Bugs

**ElevenLabs webhook trusts client-supplied `metadata.clerk_id`:**
- Symptoms: Any caller that reaches `/api/webhooks/elevenlabs` with a crafted body (`{ duration_seconds, metadata: { clerk_id: "user_VICTIM" } }`) can add minutes to an arbitrary user's account, or drain another user's quota.
- Files: `src/index.ts` (lines 240-271), `api/webhooks/elevenlabs.ts` (lines 1-29)
- Trigger: `curl -X POST /api/webhooks/elevenlabs -d '{"duration_seconds":3600,"metadata":{"clerk_id":"..."}}'`. The endpoint has no signature verification (see TODO at `src/index.ts:250`).
- Workaround: None currently. See Security Considerations below.

**Webhook sets user id from `metadata.clerk_id` without validating it exists:**
- Symptoms: If ElevenLabs metadata is missing/wrong, `recordUsage` calls `getOrCreateUser` on an arbitrary string, silently creating ghost user rows in Convex.
- Files: `src/api/usage.ts` (lines 59-76), `convex/users.ts` (`getOrCreateUser`)
- Fix approach: Verify the `clerkId` exists before crediting, or require signed metadata.

**Clerk webhook ignores plan change without user id, silently:**
- Symptoms: If `data?.subscription?.payer?.user_id` is missing on a `subscriptionItem.*` event, the handler returns 200 `{ received: true }` with no log. Subsequent subscription state drift goes unnoticed.
- Files: `src/index.ts` (lines 215-230), `api/webhooks/clerk.ts` (lines 42-56)
- Fix approach: Log a warning when `clerkUserId` is null and surface to monitoring.

**`updatePlan` silently no-ops for unknown users:**
- Symptoms: `convex/users.ts` `updatePlan` returns undefined when the user row is missing; a paying customer whose row was deleted/never created will keep `free` plan with no error.
- Files: `convex/users.ts` (lines 142-166)
- Fix approach: Upsert (create with the new plan) or throw so the webhook retries.

**Race between `addMinutesUsed` and plan reset:**
- Symptoms: `updatePlan` resets `minutesUsed: 0` on plan change. If `addMinutesUsed` (from a webhook fired mid-upgrade) lands after the reset but for the prior period, data is miscounted.
- Files: `convex/users.ts` (lines 142-166, 168-192)
- Fix approach: Store usage in a periodized sub-table or guard by `billingPeriodStart`.

**No billing period rollover:**
- Symptoms: `resetBillingPeriod` exists in `convex/users.ts` but is never called automatically. Monthly quota never resets on its own; paid users' `minutesUsed` grows forever until `updatePlan` fires.
- Files: `convex/users.ts` (lines 194-end)
- Fix approach: Add a Convex scheduled function or a Clerk `invoice.paid` webhook handler.

**Duration reported by client is untrusted:**
- Symptoms: `/api/usage/record` accepts `durationSeconds` from the browser (`src/components/ConversationView.tsx:67-82`). A malicious client can report `durationSeconds: 1` regardless of actual length.
- Files: `src/index.ts` (lines 149-175), `api/usage/record.ts`, `src/components/ConversationView.tsx` (lines 67-82)
- Fix approach: Use the ElevenLabs post-call webhook as the source of truth (once signature verification is added) and drop the client-reported path, or reconcile both.

## Security Considerations

**ElevenLabs webhook lacks HMAC signature verification:**
- Risk: Webhook endpoint is effectively public. Attackers can mint arbitrary usage events (see "Known Bugs" above).
- Files: `src/index.ts` (line 250 — `TODO: Validate HMAC signature from ElevenLabs-Signature header`), `api/webhooks/elevenlabs.ts` (lines 9-13)
- Current mitigation: `ELEVENLABS_WEBHOOK_SECRET` is read and required to be set but is never used to verify the payload.
- Recommendations: Implement HMAC-SHA256 verification per ElevenLabs docs. Until then, gate the route on an allowlisted IP range or a shared secret header as a stopgap.

**ElevenLabs agent overrides come from the client:**
- Risk: `ConversationView.tsx` passes `systemPrompt` and `firstMessage` to `conversation.startSession({ overrides: ... })` (lines 121-132). These values are returned by `/api/agents` after auth, but the client receives them in the JSON response and re-sends them as overrides. A tampered client could substitute any prompt.
- Files: `src/components/ConversationView.tsx` (lines 121-132), `src/api/agents.ts`
- Current mitigation: None — the ElevenLabs SDK is being told to honor arbitrary client prompts.
- Recommendations: Configure prompt overrides server-side when minting the conversation token, or sign the prompt payload and have the ElevenLabs agent reject unsigned overrides.

**Global knowledgebase is not scoped per user:**
- Risk: Any authenticated user can read or delete another user's uploaded documents via `/api/documents`, `/api/documents/:id`, and `/api/documents/:id DELETE`. `getDocumentsContext()` also injects *all* users' document text into *every* agent system prompt.
- Files: `src/api/knowledgebase.ts` (lines 11-12, 60-70), `api/documents/**`, `src/index.ts` (lines 281-372)
- Current mitigation: Auth gate ensures the caller is signed in, but does not isolate tenants.
- Recommendations: Key the storage by `auth.userId` on read/delete/list. Filter `getDocumentsContext(userId)` to the active user.

**Clerk secret keys read from `process.env` with silent fallback:**
- Risk: If `CLERK_SECRET_KEY` is unset, `requireAuth` in `src/index.ts` (lines 33-40, 63-69) returns `401 Unauthorized` rather than failing loudly at boot. The Vercel variant (`api/_lib/auth.ts`) returns `500 Auth not configured` — inconsistent. Misconfiguration could masquerade as "all users unauthorized" and be missed in prod smoke tests.
- Files: `api/_lib/auth.ts` (lines 3-17), `src/index.ts` (lines 33-40)
- Recommendations: Fail-fast on missing secret at process start in both entrypoints.

**Frontend Clerk publishable key is embedded at build time:**
- Risk: Acceptable (publishable keys are designed for this), but note: the Bun server injects the key via `Bun.build` `define` (`src/index.ts` lines 391-394). Ensure only publishable (not secret) keys are ever referenced in the `VITE_PUBLIC_*` namespace. Current code is correct but name collisions (`CLERK_SECRET_KEY` vs `VITE_PUBLIC_CLERK_PUBLISHABLE_KEY`) are easy to make.
- Recommendations: Add a lint rule forbidding `import.meta.env.*SECRET*`.

**Convex `getOrCreateUser` is a public mutation:**
- Risk: `convex/users.ts` `getOrCreateUser` (lines 13-34) accepts any `clerkId: v.string()` from any caller with the deployment URL. Anyone who discovers `VITE_CONVEX_URL` (it ships in the client bundle) can spray-create users.
- Files: `convex/users.ts` (lines 13-34, 142-166, 168-192, etc.)
- Current mitigation: None — arg-based mutations do not check `ctx.auth`.
- Recommendations: For frontend use, prefer `ensureCurrentUser`/`getMyUsage` (which use `ctx.auth`). For backend use, gate by a shared secret or call only via Convex actions with identity checks. Mark arg-based functions as internal.

**`authFetch` sends bearer token over any URL:**
- Risk: `src/lib/authFetch.ts` attaches the Clerk token to whatever `url` is passed. If a caller ever passes an absolute URL to a third-party host (bug), the token leaks.
- Files: `src/lib/authFetch.ts`
- Recommendations: Assert `url.startsWith("/")` or that the origin matches `window.location.origin`.

**Logging webhook body contents:**
- Risk: `src/index.ts:255` and `api/webhooks/elevenlabs.ts:16` log the first 200 chars of the webhook body. For Clerk webhooks (`src/index.ts:212`), the event type is logged — fine. For ElevenLabs, payloads may contain conversation metadata or PII.
- Files: `src/index.ts` (line 255), `api/webhooks/elevenlabs.ts` (line 16)
- Recommendations: Log `event.type` and IDs only, not raw JSON.

## Performance Bottlenecks

**`getDocumentsContext()` concatenates all documents into every system prompt:**
- Problem: Every call to `getAgentForMode` (on every conversation start) serializes the full text of every uploaded document into the ElevenLabs prompt (`src/api/knowledgebase.ts` lines 60-70, invoked from `src/api/agents.ts:41`).
- Files: `src/api/knowledgebase.ts`, `src/api/agents.ts`
- Cause: No summarization, no retrieval, no size cap.
- Improvement path: Cap context length, chunk and retrieve only relevant docs, or hand docs to ElevenLabs' agent knowledgebase API instead of inlining.

**Frontend transpilation per request in dev/prod:**
- Problem: `src/index.ts` lines 375-429 runs `Bun.build` on every request to `/frontend.tsx`.
- Files: `src/index.ts` (lines 374-429)
- Cause: No compiled-output caching.
- Improvement path: Build once at startup (or at deploy) and serve the cached artifact; keep live-transpile only for dev.

**Convex query per minute check:**
- Problem: Every `/api/usage` and every `/api/agents/:id/conversation-token` call issues `getOrCreateUser` (mutation) + `getUsage` (query) serially.
- Files: `src/api/usage.ts` (lines 35-56)
- Improvement path: Call `getOrCreateUser` only on first sign-in (via a Clerk `user.created` webhook) and drop the per-request mutation.

## Fragile Areas

**Clerk plan slug mapping:**
- Files: `src/api/billing.ts` (lines 22-33)
- Why fragile: Plan slugs must be configured identically in the Clerk Dashboard. A typo in either place silently logs `Unknown Clerk plan slug` and the user stays on `free` — they keep paying without receiving their upgrade.
- Safe modification: Add end-to-end test that triggers a `subscriptionItem.active` webhook and asserts the Convex `plan` value. Add a `/api/admin/plan/:clerkId` read endpoint for manual verification.
- Test coverage: None for the webhook → Convex path.

**Webhook event shape relies on optional nested fields:**
- Files: `src/index.ts` (lines 215-230), `api/webhooks/clerk.ts` (lines 42-56)
- Why fragile: Code reads `data?.subscription?.payer?.user_id` and `data?.plan?.slug || data?.plan?.name`. Clerk can (and has) change webhook payload shapes between versions. A silent failure leaves the user on the wrong plan.
- Safe modification: Define a zod schema for the expected payload; log a warning on schema mismatch.

**Dynamic-route handlers parse paths by index:**
- Files: `api/agents/[agentId]/conversation-token.ts` (lines 23-31), `api/documents/[id]/index.ts` (lines 8-13)
- Why fragile: Manual `url.pathname.split("/")` + `indexOf("agents")+1` breaks silently if the route is mounted under a prefix or if there's a trailing slash.
- Safe modification: Use Vercel's parsed params (via an adapter) or validate with a regex.

## Scaling Limits

**In-memory document storage caps at single-instance capacity:**
- Current capacity: Limited by process memory; no eviction.
- Limit: Memory OOM, or on serverless, a per-invocation "capacity" of zero (lost on cold start).
- Scaling path: Move to Convex table or blob store.

**Webhooks are not idempotent:**
- Current capacity: Each delivered webhook mutates state.
- Limit: Svix retries on 5xx. If the handler 500s after `syncClerkPlan` but before returning, the next retry will re-apply `minutesUsed: 0` reset in `updatePlan`, discarding minutes used in between.
- Scaling path: Record `svix-id` in Convex and skip if already processed.

## Dependencies at Risk

**`@ai-sdk/react` (^2.0.112) and `ai` (^5.0.110) are imported but unused:**
- Risk: Shipped in the frontend bundle without any visible importers; adds weight and supply-chain surface.
- Impact: Bundle size.
- Migration plan: Verify no usage then remove.

**`ogl` (^1.0.11) is large and used only for background shaders:**
- Risk: Heavy WebGL dependency bundled on the landing page (`Aurora.jsx`, `LightRays.jsx`).
- Impact: First-paint performance on low-end devices.
- Migration plan: Lazy-load the shader components.

## Missing Critical Features

**PDF/DOCX parsing is stubbed:**
- Problem: `src/api/knowledgebase.ts` lines 82-91 return placeholder strings for PDF/DOC/DOCX uploads.
- Blocks: The primary advertised use case ("upload a PDF, talk about it") does not actually feed the document to the agent — it feeds a literal placeholder string.

**No usage period rollover or proration:**
- Problem: No scheduled Convex job resets `minutesUsed` at the end of a billing cycle.
- Blocks: After 30 days, paid users will exceed their monthly quota and be blocked until a plan-change event fires.

**No admin/ops observability:**
- Problem: No endpoint or dashboard to inspect a user's plan, usage, or webhook history. Only `console.log` to server stderr.
- Blocks: Support debugging when a user reports "I paid but I'm still on free."

## Test Coverage Gaps

**Untested: Clerk webhook path end-to-end:**
- What's not tested: Svix verification, `subscriptionItem.*` → `syncClerkPlan` → Convex `updatePlan`.
- Files: `src/index.ts` (lines 178-238), `api/webhooks/clerk.ts`, `src/api/billing.ts`, `convex/users.ts`
- Risk: Billing plan upgrades can silently fail. This is the most business-critical flow.
- Priority: High.

**Untested: ElevenLabs webhook:**
- What's not tested: `recordUsage` from webhook body, handling of missing metadata, signature verification (not implemented).
- Files: `src/index.ts` (lines 240-271), `api/webhooks/elevenlabs.ts`
- Risk: Quota accounting.
- Priority: High.

**Untested: `requireAuth` / unauthenticated access:**
- What's not tested: That protected routes return 401 when Clerk token is missing or invalid.
- Files: `api/_lib/auth.ts`, `src/index.ts` (lines 42-69)
- Risk: A refactor to auth middleware could open all routes.
- Priority: High.

**Untested: Usage limit enforcement at token issuance:**
- What's not tested: That `/api/agents/:id/conversation-token` returns 403 when `checkUsage.allowed === false`.
- Files: `src/index.ts` (lines 101-127), `api/agents/[agentId]/conversation-token.ts`
- Risk: Revenue leakage — free users could obtain unlimited tokens.
- Priority: High.

**Untested: Convex `addMinutesUsed` free vs paid branching:**
- What's not tested: That free-plan usage writes to `freeTrialMinutesUsed` while paid writes to `minutesUsed`.
- Files: `convex/users.ts` (lines 168-192)
- Priority: Medium.

**Test suite covers mostly prompt-building:**
- Files: `src/api/__tests__/agents.test.ts`, `src/api/__tests__/agentPrompts.test.ts`, `src/api/__tests__/knowledgebase.test.ts`, `src/api/__tests__/auditAgents.test.ts`
- Gap: No Playwright (E2E) coverage of auth-gated flows despite `@playwright/test` being installed.
- Priority: Medium.

---

*Concerns audit: 2026-04-21*
