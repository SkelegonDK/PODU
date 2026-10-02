# External Integrations

**Analysis Date:** 2026-04-21

## APIs & External Services

**Voice AI / Conversational AI:**
- ElevenLabs Conversational AI (WebRTC) - Primary product integration
  - Client SDK: `@elevenlabs/react` (`useConversation` hook in `src/components/ConversationView.tsx`)
  - Server-side token minting + agent routing: `src/api/agents.ts` (`getConversationToken`, `getAgentForMode`)
  - Three configured agents (one per conversation mode): fun, educational, deep
  - Auth env vars: `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID_FUN`, `ELEVENLABS_AGENT_ID_EDU`, `ELEVENLABS_AGENT_ID_DEEP`
  - Webhook receiver: `api/webhooks/elevenlabs.ts` (secret: `ELEVENLABS_WEBHOOK_SECRET`)
  - System prompts defined in `src/api/agentPrompts.ts` and pushed to ElevenLabs via dynamic override + audit CLI (`src/api/auditAgents.cli.ts`)

**AI Model SDK:**
- Vercel AI SDK - Packages `ai ^5.0.110`, `@ai-sdk/react ^2.0.112` present in dependencies (no specific provider client observed beyond ElevenLabs)

## Data Storage

**Databases:**
- Convex (`^1.32.0`) - Primary reactive database
  - Schema: `convex/schema.ts` — tables `users` (Clerk-linked plan + minutes usage) and `conversations` (per-session duration tracking)
  - Functions: `convex/users.ts`, `convex/conversations.ts`
  - Server client: `ConvexHttpClient` from `convex/browser` used in `src/api/billing.ts`, `src/api/usage.ts`
  - Browser client: `ConvexReactClient` + `ConvexProviderWithClerk` in `src/frontend.tsx`
  - Auth config: `convex/auth.config.ts` (Clerk JWT integration)
  - Connection env vars: `CONVEX_URL`, `CONVEX_DEPLOYMENT`, `CONVEX_DEPLOYMENT_KEY`

**File Storage:**
- In-memory only - Knowledgebase documents stored in a `Map` in `src/api/knowledgebase.ts` (comment explicitly notes "in production, use a database")

**Caching:**
- None detected

## Authentication & Identity

**Auth Provider:**
- Clerk - Full auth + billing stack
  - React SDK: `@clerk/clerk-react` (`ClerkProvider`, `SignedIn`, `SignedOut`, `SignInButton`, `SignUpButton`, `UserButton`, `PricingTable`, `useAuth`) — used in `src/frontend.tsx`, `src/App.tsx`, `src/components/LandingPage.tsx`, `src/components/PricingPage.tsx`, `src/components/SaasLandingPage.tsx`
  - Backend SDK: `@clerk/backend` → `createClerkClient({ secretKey, publishableKey })` in `src/index.ts` with `authenticateRequest` helper
  - Serverless helper: `api/_lib/auth.ts`
  - JWT → Convex bridge via `ConvexProviderWithClerk`
  - Webhook receiver: `api/webhooks/clerk.ts` and inline handler in `src/index.ts` (verified via Svix)
  - Env vars: `VITE_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_JWT_ISSUER_URL`, `CLERK_WEBHOOK_SECRET`

**Billing:**
- Clerk Billing (built-in) - No Stripe SDK dependency detected
  - Plan sync: `src/api/billing.ts` (`syncClerkPlan`) maps Clerk plan slugs → internal plans (`casual`, `regular`, `deep`) and writes to Convex `users` table
  - Pricing UI: `@clerk/clerk-react` `<PricingTable />` in `src/components/PricingPage.tsx`
  - Iron session secret env var present: `IRON_SESSION_SECRET_KEY` (use site not located in grep)

## Monitoring & Observability

**Error Tracking:**
- None detected

**Logs:**
- `console.warn` / `console.error` only (e.g., missing-env warnings and auth failures in `src/index.ts`)

## CI/CD & Deployment

**Hosting:**
- Vercel - Configured via `vercel.json` (build command `bun run build`, output `dist/`, SPA rewrites, `/api/*` routed to Vercel serverless functions)
- Convex - Separate deployment lifecycle controlled via `CONVEX_DEPLOYMENT_KEY`

**CI Pipeline:**
- None detected in repo (no `.github/workflows/`, `.gitlab-ci.yml`, or similar)

## Environment Configuration

**Required env vars (from `.env.example`):**
- ElevenLabs: `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID_FUN`, `ELEVENLABS_AGENT_ID_EDU`, `ELEVENLABS_AGENT_ID_DEEP`, `ELEVENLABS_WEBHOOK_SECRET`
- Clerk: `VITE_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_JWT_ISSUER_URL`, `CLERK_WEBHOOK_SECRET`
- Convex: `CONVEX_URL`, `CONVEX_DEPLOYMENT`, `CONVEX_DEPLOYMENT_KEY`
- Session: `IRON_SESSION_SECRET_KEY`
- Optional: `PORT` (defaults to `3000`), `HOST` (defaults to `127.0.0.1`)

**Secrets location:**
- Local: `.env`, `.env.local` (gitignored; contents not inspected)
- Production: Vercel + Convex environment variable dashboards

## Webhooks & Callbacks

**Incoming:**
- `POST /api/webhooks/clerk` → `api/webhooks/clerk.ts` - Signature verified with `svix` using `CLERK_WEBHOOK_SECRET`; syncs user plan changes into Convex
- `POST /api/webhooks/elevenlabs` → `api/webhooks/elevenlabs.ts` - Receives ElevenLabs conversation events; signed with `ELEVENLABS_WEBHOOK_SECRET` (signature validation flagged as TODO)

**Outgoing:**
- ElevenLabs REST API calls from `src/api/agents.ts` (conversation token minting) and `src/api/auditAgents.ts` (agent configuration audit/push)
- Convex HTTP mutations/queries from `src/api/billing.ts`, `src/api/usage.ts` via `ConvexHttpClient`
- Clerk backend calls via `clerkClient.authenticateRequest` in `src/index.ts`

---

*Integration audit: 2026-04-21*
