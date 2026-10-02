# Technology Stack

**Analysis Date:** 2026-04-21

## Languages

**Primary:**
- TypeScript (ESNext target, strict mode) - Application code in `src/`, serverless handlers in `api/`, Convex functions in `convex/`
- TSX (React 19, `jsx: "react-jsx"`) - UI components in `src/components/`

**Secondary:**
- JavaScript (JSX) - WebGL background effects in `src/components/Aurora.jsx` and `src/components/LightRays.jsx`
- CSS - Tailwind-based styles in `styles/globals.css` and `src/index.css`

## Runtime

**Environment:**
- Bun (server + build runtime) - Used via `bun --hot src/index.ts` for dev and `bun src/index.ts` for production; see `package.json` scripts and `bunfig.toml`
- Node.js compatibility - Vercel serverless runtime for files under `api/` (see `vercel.json`)
- Browser (React 19) - Client bundle served from Bun's built-in `serve` with HTML route in `src/index.html`

**Package Manager:**
- Bun (primary) - Lockfile: `bun.lock` (45KB, present)
- npm (secondary) - `package-lock.json` also present (53KB), likely used by Vercel deploy

## Frameworks

**Core:**
- React `^19` - UI framework (`react`, `react-dom`)
- Convex `^1.32.0` - Reactive backend/database (`convex/schema.ts`, `convex/_generated/`)
- Clerk `@clerk/clerk-react ^5.59.2` + `@clerk/backend ^2.32.1` - Auth + billing
- Bun built-in `serve` - HTTP server entrypoint (`src/index.ts`)

**Testing:**
- Playwright `@playwright/test ^1.48.0` - E2E tests (`playwright.config.ts`, `tests/` dir)
- Bun test runner - Unit tests via `bun test src/` (`src/api/__tests__/`)

**Build/Dev:**
- Custom Bun build script - `build.ts` executed via `bun run build.ts`
- `bun-plugin-tailwind ^0.1.2` - Tailwind integration for Bun bundler (registered in `bunfig.toml`)
- Tailwind CSS `^4.1.11` (devDependency) - Utility-first CSS
- `tw-animate-css ^1.4.0` - Animation utilities
- shadcn/ui (style: `new-york`) - Component scaffolding config in `components.json`

## Key Dependencies

**Critical:**
- `@elevenlabs/react ^0.14.1` - WebRTC conversational AI client hook (`useConversation` in `src/components/ConversationView.tsx`)
- `@ai-sdk/react ^2.0.112` + `ai ^5.0.110` - Vercel AI SDK (React bindings + core)
- `convex ^1.32.0` - Client + server SDK; `ConvexHttpClient` used in `src/api/billing.ts`, `ConvexReactClient` + `ConvexProviderWithClerk` in `src/frontend.tsx`
- `svix ^1.86.0` - Webhook signature verification (Clerk webhooks in `api/webhooks/clerk.ts` and `src/index.ts`)

**UI:**
- `@radix-ui/react-dialog ^1.1.15`, `@radix-ui/react-label ^2.1.7`, `@radix-ui/react-select ^2.2.6`, `@radix-ui/react-slot ^1.2.3` - Headless primitives
- `lucide-react ^0.545.0` - Icon library (configured as `iconLibrary` in `components.json`)
- `class-variance-authority ^0.7.1`, `clsx ^2.1.1`, `tailwind-merge ^3.3.1` - Class composition (see `src/lib/utils.ts`)
- `ogl ^1.0.11` - Minimal WebGL library (Aurora/LightRays background effects)
- `@fontsource/uncut-sans ^5.2.5` - Self-hosted font (Candy Pop theme)

**Types:**
- `@types/bun` (latest) - Bun runtime types (`bun-env.d.ts`)
- `@types/react ^19`, `@types/react-dom ^19`

## Configuration

**TypeScript (`tsconfig.json`):**
- `target: ESNext`, `module: Preserve`, `moduleResolution: bundler`
- `strict: true`, `noUncheckedIndexedAccess: true`, `noImplicitOverride: true`
- `verbatimModuleSyntax: true`, `allowImportingTsExtensions: true`, `noEmit: true`
- Path alias: `@/*` → `./src/*`

**Environment (not read — see `.env.example`):**
- `.env`, `.env.local`, `.env.example` present at repo root (existence only — contents not inspected)
- Bun exposes browser env vars prefixed `BUN_PUBLIC_*` (`bunfig.toml`)

**Build:**
- `build.ts` - Custom Bun build entrypoint
- `vercel.json` - `buildCommand: bun run build`, `outputDirectory: dist`, SPA rewrites with `/api/*` passthrough
- `bunfig.toml` - Tailwind plugin for `serve.static`
- `components.json` - shadcn/ui registry config (Tailwind CSS vars, `neutral` base color)

## Platform Requirements

**Development:**
- Bun installed (primary runtime)
- Node.js for `npm`/Vercel compatibility paths
- ElevenLabs, Clerk, and Convex accounts (see `README.md` prerequisites)
- `bunx playwright install --with-deps` for E2E tests

**Production:**
- Vercel deployment - SPA assets from `dist/`, serverless functions from `api/`
- Convex deployment (separate `npx convex deploy` lifecycle; see `CONVEX_DEPLOYMENT_KEY`)
- Clerk application + billing configured with plan slugs mapped in `src/api/billing.ts`

---

*Stack analysis: 2026-04-21*
