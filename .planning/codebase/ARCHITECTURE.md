# Architecture

**Analysis Date:** 2026-04-21

## Pattern Overview

**Overall:** Single-process Bun server that both serves the React SPA and hosts HTTP API routes, backed by Convex (serverless DB/functions) and ElevenLabs (voice AI).

**Key Characteristics:**
- Unified Bun entrypoint (`src/index.ts`) handles both static asset serving and `/api/*` routes via `Bun.serve({ routes })`
- Stateless HTTP API layer — all persistent state lives in Convex (`convex/schema.ts`)
- Client-side React SPA using Clerk for auth, Convex React client for reactive data, and `@elevenlabs/react` `useConversation` for live WebRTC voice
- Dual API surface: canonical implementation lives in `src/api/*` (imported by the Bun server); a parallel `api/*` tree exists for Vercel serverless deployment and thin-wraps the same modules
- Per-request Clerk authentication middleware gates every non-webhook API route
- External-service-side state for agent config: agent IDs/voices are configured in ElevenLabs dashboard; the app only injects a per-conversation `systemPrompt` and `firstMessage` override

## Layers

**Presentation (React SPA):**
- Purpose: UI for subject/mode selection, usage meters, voice conversation, pricing/billing
- Location: `src/components/`
- Contains: Page components (`LandingPage.tsx`, `SaasLandingPage.tsx`, `PricingPage.tsx`), feature components (`ConversationView.tsx`, `DocumentUpload.tsx`, `UploadDialog.tsx`, `UsageMeter.tsx`, `SubjectSelector.tsx`, `ModeSelector.tsx`, `PlayButton.tsx`), visual effects (`Aurora.jsx`, `LightRays.jsx`), shadcn-style primitives under `src/components/ui/`
- Depends on: `@clerk/clerk-react`, `@elevenlabs/react`, `convex/react`, `src/lib/authFetch.ts`
- Used by: `src/App.tsx` (root component chosen via `<SignedIn>`/`<SignedOut>`)

**Client Shell (`src/App.tsx`, `src/frontend.tsx`):**
- Purpose: Bootstraps React, wires `ClerkProvider` and `ConvexProviderWithClerk`
- Location: `src/frontend.tsx` (entry), `src/App.tsx` (auth-gated view switch)
- `frontend.tsx` is transpiled on the fly by the Bun server (`/frontend.tsx` route) with `VITE_*` env vars injected via `Bun.build` `define`

**HTTP API (Bun route handlers):**
- Purpose: Authenticate requests, orchestrate domain logic, talk to ElevenLabs and Convex
- Location: `src/index.ts` (routes table: `/api/agents`, `/api/agents/:agentId/conversation-token`, `/api/usage`, `/api/usage/record`, `/api/documents`, `/api/documents/:id`, `/api/webhooks/clerk`, `/api/webhooks/elevenlabs`, `/api/health`)
- Depends on: `src/api/*` modules, `@clerk/backend` for auth, `svix` for Clerk webhook verification
- Used by: React client via `authFetch` (with Clerk bearer token)

**Vercel Serverless Mirror (optional deploy target):**
- Purpose: Provide per-route handler files for Vercel's file-based routing
- Location: `api/agents/index.ts`, `api/agents/[agentId]/conversation-token.ts` (via `[agentId]` dir), `api/documents/index.ts`, `api/documents/[id]/…`, `api/usage/index.ts`, `api/usage/record.ts`, `api/webhooks/clerk.ts`, `api/webhooks/elevenlabs.ts`, `api/health.ts`, shared `api/_lib/auth.ts`
- Pattern: Each file re-exports a `default` handler that calls `requireAuth` then delegates to the same `src/api/*` domain module used by `src/index.ts`

**Domain Services (`src/api/`):**
- Purpose: Pure-ish business logic: agent orchestration, usage accounting, knowledgebase, billing, prompt templates
- Location: `src/api/agents.ts`, `src/api/agentPrompts.ts`, `src/api/usage.ts`, `src/api/billing.ts`, `src/api/knowledgebase.ts`, `src/api/auditAgents.ts`, `src/api/auditAgents.cli.ts`
- Depends on: `convex/_generated/api` via `ConvexHttpClient`, ElevenLabs REST API, env vars for agent IDs
- Used by: Route handlers in both `src/index.ts` and `api/**`

**Persistence (Convex):**
- Purpose: Canonical storage for users, plans, minutes-used, conversation logs
- Location: `convex/schema.ts`, `convex/users.ts`, `convex/conversations.ts`, `convex/auth.config.ts`, generated types in `convex/_generated/`
- Tables: `users` (indexed by `clerkId`) and `conversations` (indexed by `clerkId`)
- Accessed server-side via `ConvexHttpClient(process.env.CONVEX_URL)`; client-side via `ConvexReactClient` + `ConvexProviderWithClerk`

**External Integrations:**
- ElevenLabs Conversational AI — agent IDs per mode in env (`ELEVENLABS_AGENT_ID_FUN|EDU|DEEP`), REST token endpoint `https://api.elevenlabs.io/v1/convai/conversation/token`, WebRTC handled client-side by `@elevenlabs/react`
- Clerk — auth (JWT bearer on every API request), billing webhooks via Svix, React SDK for UI
- Convex — typed server/client SDK

## Data Flow

**Start a Conversation (primary flow):**

1. User signs in via Clerk; `App.tsx` renders `<LandingPage>` (`src/components/LandingPage.tsx`)
2. User picks subjects in `SubjectSelector.tsx` and a mode (fun/edu/deep) in `ModeSelector.tsx`
3. User presses `PlayButton.tsx`; `LandingPage` calls `authFetch("/api/agents", POST {mode, subjects})`
4. Bun server (`src/index.ts` `/api/agents` handler) → `requireAuth` (Clerk) → `getAgentForMode` (`src/api/agents.ts`)
5. `getAgentForMode` resolves the env-configured agent ID, builds `systemPrompt` via `buildFullPrompt` (merges `AGENT_PROMPTS[mode]` + topic focus + `getDocumentsContext()` from `src/api/knowledgebase.ts`), builds `firstMessage` via `AGENT_PROMPTS[mode].buildFirstMessage(subjectNames)`
6. Client receives `{ agentId, systemPrompt, firstMessage }` and mounts `<ConversationView>` (`src/components/ConversationView.tsx`)
7. `ConversationView` calls `authFetch("/api/agents/:agentId/conversation-token")`; server runs `checkUsage(clerkId)` (via Convex) — 403 if plan limit exceeded — then fetches a short-lived WebRTC token from ElevenLabs using `ELEVENLABS_API_KEY`
8. `useConversation` (from `@elevenlabs/react`) opens WebRTC using the token and sends the `systemPrompt` + `firstMessage` as overrides
9. Conversation start time is recorded in a `useRef` (`conversationStartTime`)
10. On disconnect (`onClose` / unmount), `reportUsage` POSTs `{ durationSeconds, mode, agentId }` to `/api/usage/record` → `recordUsage` in `src/api/usage.ts` calls `api.users.addMinutesUsed` and `api.conversations.logConversation` on Convex

**Clerk Billing Webhook → Plan Sync:**

1. Clerk billing event hits `/api/webhooks/clerk`
2. Bun server verifies Svix headers (`svix-id`, `svix-timestamp`, `svix-signature`) against `CLERK_WEBHOOK_SECRET`
3. For `subscriptionItem.active|canceled|ended`, extracts `clerkUserId` and `planSlug`
4. Calls `syncClerkPlan(clerkUserId, planSlug, isActive)` in `src/api/billing.ts` which updates the `users.plan` field in Convex

**ElevenLabs Post-Call Webhook:**

1. ElevenLabs POSTs to `/api/webhooks/elevenlabs` after a call ends
2. HMAC validation is currently a `TODO` in `src/index.ts` — all requests are accepted
3. If payload contains `metadata.clerk_id` and `duration_seconds`, server records usage via `recordUsage` — redundant with the client-side report but authoritative when client disconnect is unclean

**State Management:**
- Auth state: Clerk `useAuth`/`UserButton` from `@clerk/clerk-react`
- Server state: Convex reactive queries (`ConvexProviderWithClerk`) for live usage, `authFetch`-based REST for command-style actions
- Local UI state: React `useState`/`useRef` inside components (no Redux/Zustand/Context beyond Clerk and Convex providers)

## Key Abstractions

**`ConversationMode`:**
- Purpose: Enumerates the three conversation personas ("fun" | "edu" | "deep")
- Examples: `src/components/ModeSelector.tsx` (type origin), consumed by `src/api/agents.ts`, `src/api/agentPrompts.ts`, `src/components/ConversationView.tsx`
- Pattern: String literal union re-imported across client and server

**`AGENT_PROMPTS`:**
- Purpose: Mode-keyed table of `{ systemPrompt, buildFirstMessage }` templates
- Examples: `src/api/agentPrompts.ts`
- Pattern: Static template lookup; `buildFullPrompt` composes base + topic constraints + doc context

**`authFetch`:**
- Purpose: Thin wrapper that attaches Clerk JWT as `Authorization: Bearer` header
- Examples: `src/lib/authFetch.ts`, callers in `LandingPage.tsx`, `ConversationView.tsx`, `DocumentUpload.tsx`, `UploadDialog.tsx`
- Pattern: Higher-order function `(getToken, url, init) => fetch(...)` — components memoize via `useCallback`

**`requireAuth` / `authenticateRequest`:**
- Purpose: Server middleware verifying Clerk session on incoming `Request`
- Examples: inline in `src/index.ts`; mirrored in `api/_lib/auth.ts`
- Pattern: Returns either `{ userId }` or a `Response` (401) — caller checks `instanceof Response`

**`ConvexHttpClient` (lazy singleton):**
- Purpose: Server-side Convex client constructed on first use
- Examples: `src/api/usage.ts` (`getConvexClient()`), `src/api/billing.ts`
- Pattern: Module-scoped nullable client + `getConvexClient()` accessor

**Plan Limits:**
- Purpose: Minute quotas per plan tier
- Location: Duplicated in `src/api/usage.ts` `PLAN_LIMITS` and `convex/users.ts` `PLAN_LIMITS` — values: `free: 5, casual: 30, regular: 120, deep: 300`

## Entry Points

**Bun Server (dev + prod):**
- Location: `src/index.ts`
- Triggers: `bun run dev` (hot reload) or `bun run start` (production); defaults to `127.0.0.1:3000`
- Responsibilities: Define route table, authenticate, dispatch to domain modules, serve HTML catch-all, on-the-fly transpile `/frontend.tsx`

**React Client:**
- Location: `src/frontend.tsx` (loaded via `<script type="module">` in `src/index.html`)
- Triggers: Browser loads any non-API, non-static route — `/*` serves `index.html`
- Responsibilities: Mount `ClerkProvider` > `ConvexProviderWithClerk` > `<App/>`

**Vercel Functions (alt deployment):**
- Location: every file under `api/` with a `default export` handler
- Triggers: Vercel routing (`vercel.json` rewrites `/api/(.*) -> /api/$1`, everything else to `/index.html`)
- Responsibilities: Same as Bun route handlers but one file per route

**CLI Tools:**
- Location: `src/api/auditAgents.cli.ts` (run via `bun run audit:agents`)
- Purpose: Audit ElevenLabs agent configuration

**Convex Functions:**
- Location: `convex/users.ts`, `convex/conversations.ts`
- Triggers: RPC from `ConvexHttpClient` (server) or `useQuery`/`useMutation` (client)

## Error Handling

**Strategy:** Try/catch at the route handler boundary; log via `console.error`; return JSON `{ error }` with appropriate HTTP status. Never leak stack traces.

**Patterns:**
- Route handlers wrap domain calls in `try { ... } catch (error) { console.error(...); return Response.json({error}, {status: 500}) }`
- `requireAuth` returns a `Response` (short-circuit) rather than throwing — callers check `instanceof Response`
- Client UI: `LandingPage.tsx` and `ConversationView.tsx` track `error`/`startError` state and surface via `AlertCircle` alert blocks
- Usage-limit errors return HTTP 403 with `{ error, usage }` payload so the client can render an upgrade prompt
- Webhook signature failures return 401 (`Invalid signature`) without processing the body
- `throw new Error` inside domain modules with actionable messages (e.g. "No agent ID configured for mode: X. Set ELEVENLABS_AGENT_ID_X in your .env file.")

## Cross-Cutting Concerns

**Logging:** `console.log` / `console.error` only; Bun dev server echoes browser logs to terminal via `development.console: true`.

**Validation:** Convex `v.*` validators on all Convex functions (`convex/schema.ts`, `convex/users.ts`). HTTP boundary validates minimally in-line (e.g. `typeof durationSeconds !== "number"` in `/api/usage/record`). No Zod or shared schema library.

**Authentication:**
- Clients attach Clerk JWT via `authFetch` → `Authorization: Bearer <token>`
- Server verifies via `clerkClient.authenticateRequest(req, { publishableKey, secretKey })`
- Convex verifies Clerk JWT via `convex/auth.config.ts`
- Webhooks use separate shared secrets: Svix for Clerk, HMAC TODO for ElevenLabs

**Configuration:** All secrets and agent IDs read from `process.env` at module scope or first use. Required vars: `VITE_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SECRET`, `CONVEX_URL`, `VITE_CONVEX_URL`, `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID_FUN|EDU|DEEP`, `ELEVENLABS_WEBHOOK_SECRET`.

**Build / Transpile:** `bun-plugin-tailwind` for CSS; `Bun.build` invoked both at serve time (on-demand `/frontend.tsx`) and by `build.ts` for the `dist/` output consumed by Vercel.

---

*Architecture analysis: 2026-04-21*
