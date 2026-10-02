# Codebase Structure

**Analysis Date:** 2026-04-21

## Directory Layout

```
Eleven_hack/
├── src/                        # Application source (both server + client)
│   ├── index.ts                # Bun HTTP server entry — all route handlers
│   ├── index.html              # SPA shell loaded by the catch-all route
│   ├── index.css               # Global Tailwind v4 styles
│   ├── frontend.tsx            # React/Clerk/Convex provider bootstrap
│   ├── App.tsx                 # Root component (SignedIn vs SignedOut)
│   ├── APITester.tsx           # Dev-only API probe component
│   ├── logo.svg, react.svg     # Static assets
│   ├── assets/                 # Additional static assets
│   ├── components/             # React UI components
│   │   ├── LandingPage.tsx         # Authenticated app home (subject + mode + play)
│   │   ├── SaasLandingPage.tsx     # Unauthenticated marketing page
│   │   ├── PricingPage.tsx         # Plan comparison/checkout UI
│   │   ├── ConversationView.tsx    # Live voice session UI (useConversation)
│   │   ├── SubjectSelector.tsx     # Topic grid picker
│   │   ├── ModeSelector.tsx        # Fun/Edu/Deep selector (+ ConversationMode type)
│   │   ├── PlayButton.tsx          # Large start button
│   │   ├── UploadDialog.tsx        # Modal wrapper for doc upload
│   │   ├── DocumentUpload.tsx      # Per-doc upload control
│   │   ├── UsageMeter.tsx          # Minutes-used gauge
│   │   ├── Aurora.jsx / .css       # Background gradient effect
│   │   ├── LightRays.jsx / .css    # Background rays effect
│   │   └── ui/                     # shadcn-style primitives (Button, Dialog, Select, etc.)
│   ├── lib/
│   │   ├── authFetch.ts            # fetch wrapper injecting Clerk bearer token
│   │   └── utils.ts                # `cn()` tailwind class merger
│   └── api/                    # Server-side domain modules (imported by route handlers)
│       ├── agents.ts               # getAgentForMode, getConversationToken, buildFullPrompt
│       ├── agentPrompts.ts         # AGENT_PROMPTS template table keyed by mode
│       ├── usage.ts                # checkUsage / recordUsage via Convex
│       ├── billing.ts              # syncClerkPlan from Clerk webhook events
│       ├── knowledgebase.ts        # In-memory doc store + parseDocumentContent
│       ├── auditAgents.ts          # ElevenLabs agent audit helpers
│       ├── auditAgents.cli.ts      # CLI runner (bun run audit:agents)
│       └── __tests__/              # Bun unit tests for src/api
├── api/                        # Vercel serverless route files (mirror of src/index.ts routes)
│   ├── health.ts
│   ├── _lib/auth.ts                # Shared requireAuth/authenticateRequest
│   ├── agents/
│   │   ├── index.ts                # POST /api/agents
│   │   └── [agentId]/              # conversation-token.ts
│   ├── documents/
│   │   ├── index.ts                # GET/POST /api/documents
│   │   └── [id]/                   # GET/DELETE /api/documents/:id
│   ├── usage/
│   │   ├── index.ts                # GET /api/usage
│   │   └── record.ts               # POST /api/usage/record
│   └── webhooks/
│       ├── clerk.ts                # Svix-verified Clerk billing webhook
│       └── elevenlabs.ts           # ElevenLabs post-call webhook
├── convex/                     # Convex backend (schema + functions)
│   ├── schema.ts                   # users + conversations tables
│   ├── users.ts                    # getOrCreateUser, getUsage, addMinutesUsed, setPlan, PLAN_LIMITS
│   ├── conversations.ts            # logConversation
│   ├── auth.config.ts              # Clerk JWT issuer config
│   └── _generated/                 # Generated API types (do not edit)
├── tests/                      # Playwright E2E tests
│   ├── fixtures/
│   └── helpers/
├── styles/                     # Additional global CSS
├── mockups/                    # Design mockups (not shipped)
├── dist/                       # Production build output (Vercel static deploy)
├── .planning/codebase/         # GSD codebase maps (this file lives here)
├── .claude/                    # Claude Code agent config
├── .cursor/                    # Cursor IDE config
├── build.ts                    # Production bundler script (Bun.build)
├── package.json                # Scripts: dev, start, build, test, test:e2e, audit:agents
├── bun.lock / package-lock.json
├── bunfig.toml                 # Bun runtime config
├── tsconfig.json               # TS config (strict, bundler moduleResolution)
├── components.json             # shadcn/ui generator config
├── playwright.config.ts        # Playwright test config
├── vercel.json                 # Vercel rewrites + build command
├── bun-env.d.ts                # Bun type augmentation
├── APP_FLOW.md                 # Product/UX flow doc
├── README.md
├── LICENSE
└── .env, .env.local, .env.example  # Environment config (secrets NOT committed)
```

## Directory Purposes

**`src/`:**
- Purpose: All first-party application code (server entry + React client + shared domain logic)
- Contains: Server entrypoint `src/index.ts`, client entrypoint `src/frontend.tsx`, domain modules `src/api/`, UI `src/components/`
- Key files: `src/index.ts`, `src/frontend.tsx`, `src/App.tsx`, `src/index.html`

**`src/components/`:**
- Purpose: React UI components, both page-level and reusable primitives
- Contains: Page components (`LandingPage.tsx`, `SaasLandingPage.tsx`, `PricingPage.tsx`), feature components (`ConversationView.tsx`, `UsageMeter.tsx`, `SubjectSelector.tsx`, `ModeSelector.tsx`), visual effects (`Aurora.jsx`, `LightRays.jsx`)
- Key files: `src/components/LandingPage.tsx`, `src/components/ConversationView.tsx`, `src/components/ModeSelector.tsx`

**`src/components/ui/`:**
- Purpose: shadcn/ui-generated primitive components (Button, Dialog, Select, Label, etc.)
- Contains: Low-level styled wrappers over Radix UI primitives
- Convention: Do not edit hand-written logic here — regenerate via shadcn CLI when possible

**`src/lib/`:**
- Purpose: Small client-side utilities
- Key files: `src/lib/authFetch.ts` (Clerk bearer token injection), `src/lib/utils.ts` (`cn()` Tailwind merger)

**`src/api/`:**
- Purpose: Server-side domain logic — pure business functions callable from any route handler
- Contains: ElevenLabs integration (`agents.ts`, `agentPrompts.ts`), Convex-backed usage/billing (`usage.ts`, `billing.ts`), knowledgebase (`knowledgebase.ts`), agent audit CLI
- Key files: `src/api/agents.ts`, `src/api/usage.ts`, `src/api/billing.ts`

**`src/api/__tests__/`:**
- Purpose: Bun-native unit tests for domain modules
- Ran via: `bun test` or `bun test:unit`

**`api/`:**
- Purpose: Vercel serverless function entrypoints — one file per HTTP route
- Contains: Thin `default export` handlers that call `requireAuth` (from `api/_lib/auth.ts`) and delegate to `src/api/*` modules
- Convention: When adding a new route to `src/index.ts`, also add a mirrored file here to keep the Vercel deployment in sync

**`api/_lib/`:**
- Purpose: Shared helpers for Vercel handlers (auth middleware)
- Key file: `api/_lib/auth.ts`

**`convex/`:**
- Purpose: Convex backend source — tables, queries, mutations, auth config
- Contains: `schema.ts` (table defs), `users.ts`, `conversations.ts`, `auth.config.ts`
- Key files: `convex/schema.ts`, `convex/users.ts`
- Generated: `convex/_generated/` (do not edit, committed)

**`tests/`:**
- Purpose: Playwright E2E tests
- Contains: Spec files, `fixtures/`, `helpers/`
- Ran via: `bun run test:e2e`

**`styles/`:**
- Purpose: Global CSS not co-located with a component

**`dist/`:**
- Purpose: Bun production build output consumed by Vercel static hosting
- Generated: Yes (`bun run build` via `build.ts`)
- Committed: Yes (currently tracked — see `.gitignore`)

**`mockups/`:**
- Purpose: Design mockups/reference images — not included in the bundle

**`.planning/codebase/`:**
- Purpose: GSD codebase maps (ARCHITECTURE.md, STRUCTURE.md, etc.) consumed by `/gsd-plan-phase` and `/gsd-execute-phase`

## Key File Locations

**Entry Points:**
- `src/index.ts`: Bun server — all HTTP routes, Clerk auth, webhook handling, on-the-fly `frontend.tsx` transpilation, static asset fallback
- `src/frontend.tsx`: React DOM mount; wraps `<App/>` in `ClerkProvider` + `ConvexProviderWithClerk`
- `src/index.html`: SPA shell (loads `frontend.tsx` as an ES module)
- `build.ts`: Production bundler invoked by `bun run build`
- `src/api/auditAgents.cli.ts`: CLI entry for `bun run audit:agents`

**Configuration:**
- `.env` / `.env.local` / `.env.example`: Env vars (never read contents — see `.env.example` for keys)
- `tsconfig.json`: TypeScript config
- `bunfig.toml`: Bun runtime config
- `playwright.config.ts`: E2E test runner config
- `vercel.json`: Vercel build + routing
- `components.json`: shadcn/ui generator config
- `convex/auth.config.ts`: Clerk issuer/JWK config for Convex
- `convex/schema.ts`: Database schema

**Core Logic:**
- `src/api/agents.ts`: ElevenLabs agent resolution, prompt assembly, WebRTC token issuance
- `src/api/agentPrompts.ts`: System prompt + first-message templates per mode
- `src/api/usage.ts`: Plan-limit checks and usage recording
- `src/api/billing.ts`: Clerk plan → Convex sync
- `src/api/knowledgebase.ts`: Document upload/parse/list (in-memory store)
- `convex/users.ts`: User CRUD + `PLAN_LIMITS` + usage accounting
- `convex/conversations.ts`: Conversation log writer
- `src/components/ConversationView.tsx`: Client-side WebRTC voice session

**Testing:**
- `tests/`: Playwright E2E specs (`*.spec.ts`)
- `src/api/__tests__/`: Bun unit tests for domain modules

## Naming Conventions

**Files:**
- React components: `PascalCase.tsx` (e.g. `LandingPage.tsx`, `ConversationView.tsx`)
- Third-party/visual components kept as `.jsx`: `Aurora.jsx`, `LightRays.jsx` (paired with `.css`)
- Domain/utility modules: `camelCase.ts` (e.g. `authFetch.ts`, `agentPrompts.ts`)
- CLI entrypoints: `<name>.cli.ts` (e.g. `auditAgents.cli.ts`)
- Tests: co-located in `__tests__/` (unit) or top-level `tests/` (E2E)
- Route files under `api/`: follow Vercel file-based routing (`[param]` dirs, `index.ts`)

**Directories:**
- All lowercase (`src`, `api`, `convex`, `tests`)
- Private/shared helpers prefixed with `_` (e.g. `api/_lib`)
- Generated code in `_generated/` (e.g. `convex/_generated/`)

**Exports:**
- Named exports for functions and components; `default export` reserved for Vercel route handlers

## Where to Add New Code

**New API Route (Bun server):**
- Add the route object to the `routes: {}` table inside `src/index.ts`
- Apply `requireAuth(req)` at the top of the handler
- Keep business logic in a new or existing `src/api/*.ts` module

**New API Route (Vercel mirror):**
- Create `api/<segment>/index.ts` (or `api/<segment>/[param].ts` for dynamic)
- `export default` async handler — call `requireAuth` from `api/_lib/auth.ts` and delegate to `src/api/*`

**New Page / Feature Component:**
- Place under `src/components/<Feature>.tsx`
- Wire into `src/components/LandingPage.tsx` (authenticated) or `src/components/SaasLandingPage.tsx` (marketing)
- For any API call, import `authFetch` from `@/lib/authFetch` and call `authFetch(getToken, url, init)`

**New shadcn/ui Primitive:**
- Generate into `src/components/ui/` via the shadcn CLI (configured by `components.json`)

**New Convex Table / Function:**
- Add table to `convex/schema.ts` with `defineTable` + indexes
- Create `convex/<domain>.ts` with `query`/`mutation` exports (always use `v.*` validators)
- Consume server-side via `getConvexClient()` in `src/api/*.ts`; client-side via `useQuery`/`useMutation`

**New Shared Utility:**
- Client-only: `src/lib/<name>.ts`
- Server-only domain: `src/api/<name>.ts`

**New Domain / Business Logic:**
- Always in `src/api/` (not in route handlers) so both the Bun server and Vercel mirror can import it

**New Unit Test:**
- Create `src/api/__tests__/<module>.test.ts`; run with `bun test`

**New E2E Test:**
- Create `tests/<feature>.spec.ts`; run with `bun run test:e2e`

**New Env Var:**
- Add a placeholder entry to `.env.example`
- Read via `process.env.*` at first-use (avoid module-load-time reads that could crash on missing keys)

## Special Directories

**`dist/`:**
- Purpose: Production build output (HTML/JS/CSS bundle)
- Generated: Yes (`bun run build`)
- Committed: Yes (checked into git for Vercel static hosting)

**`convex/_generated/`:**
- Purpose: Auto-generated TypeScript types and API references from Convex
- Generated: Yes (by Convex CLI)
- Committed: Yes (required for type-checking)

**`playwright-report/` and `test-results/`:**
- Purpose: Playwright test artifacts (HTML reports, traces, screenshots)
- Generated: Yes (by `bun run test:e2e`)
- Committed: Should not be (verify `.gitignore`)

**`mockups/`:**
- Purpose: Design reference images
- Generated: No (hand-authored)
- Committed: Yes

**`node_modules/`:**
- Purpose: Dependencies (Bun/npm managed)
- Generated: Yes
- Committed: No

---

*Structure analysis: 2026-04-21*
