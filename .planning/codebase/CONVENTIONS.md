# Coding Conventions

**Analysis Date:** 2026-04-21

## Naming Patterns

**Files:**
- React components: `PascalCase.tsx` — e.g. `ConversationView.tsx`, `UploadDialog.tsx`, `SaasLandingPage.tsx` in `src/components/`
- UI primitives (shadcn-style): `lowercase.tsx` — e.g. `src/components/ui/dialog.tsx`, `src/components/ui/button.tsx`
- Backend/API modules: `camelCase.ts` — e.g. `src/api/agents.ts`, `src/api/agentPrompts.ts`, `src/api/auditAgents.ts`
- Utility modules: `camelCase.ts` — e.g. `src/lib/authFetch.ts`, `src/lib/utils.ts`
- CLI entrypoints: `<name>.cli.ts` — e.g. `src/api/auditAgents.cli.ts`
- Tests: `<name>.test.ts` (unit) or `<name>.spec.ts` (e2e) — e.g. `src/api/__tests__/agents.test.ts`, `tests/upload-dialog.spec.ts`
- Convex functions: `camelCase.ts` in `convex/` — e.g. `convex/conversations.ts`, `convex/users.ts`
- Vercel API routes: `camelCase.ts` under `api/` with bracketed dynamic segments — e.g. `api/agents/[agentId]/index.ts`
- Legacy WebGL components kept as `.jsx` — `src/components/Aurora.jsx`, `src/components/LightRays.jsx`

**Functions:**
- `camelCase` for all regular functions and methods — `buildFullPrompt`, `resolveSubjectNames`, `getAgentForMode`, `formatFileSize`
- React components exported as named `PascalCase` functions: `export function UploadDialog(...)` in `src/components/UploadDialog.tsx`
- React hooks prefixed `use` (standard React convention) — consumed from `@clerk/clerk-react`, `@elevenlabs/react`

**Variables:**
- `camelCase` for locals and fields — `fileInputRef`, `isDragging`, `newDocs`, `subjectNames`
- `SCREAMING_SNAKE_CASE` for module-level constants and records — `SUBJECT_NAMES`, `AGENT_ID_ENV_VARS`, `AGENT_PROMPTS` in `src/api/agents.ts` and `src/api/agentPrompts.ts`
- `UPPER_SNAKE_CASE` for env var names — `ELEVENLABS_AGENT_ID_FUN`, `ELEVENLABS_API_KEY`

**Types:**
- `PascalCase` for interfaces and type aliases — `UploadedDocument`, `UploadDialogProps`, `GetAgentRequest`, `GetAgentResponse`, `ConversationMode`
- `Props` suffix for component prop interfaces — `UploadDialogProps`, `ConversationViewProps`
- Prefer `interface` for object shapes that describe structures; `type` imports use `import type` due to `verbatimModuleSyntax`

## Code Style

**Formatting:**
- No Prettier or Biome config file present in repo root
- Observed style in source: 2-space indentation, double-quoted strings, semicolons terminated, trailing commas in multi-line literals
- Line width appears ~100 chars; multi-arg function signatures broken onto separate lines

**Linting:**
- No ESLint/Biome configuration detected (`.eslintrc*`, `eslint.config.*`, `biome.json` absent)
- TypeScript strictness enforced via `tsconfig.json`:
  - `"strict": true`
  - `"noFallthroughCasesInSwitch": true`
  - `"noUncheckedIndexedAccess": true`
  - `"noImplicitOverride": true`
  - `"verbatimModuleSyntax": true` (forces `import type` for type-only imports)
  - `"noUnusedLocals": false`, `"noUnusedParameters": false` (relaxed)
- No typecheck script in `package.json`; type checking happens only at editor/build time

## Import Organization

**Order (observed in `src/components/UploadDialog.tsx`):**
1. React primitives — `import { useState, useRef, useCallback } from "react"`
2. Internal `@/` aliased utilities — `import { cn } from "@/lib/utils"`
3. Third-party packages — `@clerk/clerk-react`, `lucide-react`
4. Internal project utilities via `@/` — `import { authFetch } from "@/lib/authFetch"`
5. Relative local components — `./ui/dialog`, `./ui/button`

**Path Aliases:**
- `@/*` → `./src/*` (configured in `tsconfig.json` `paths`)
- Used in frontend code; backend API modules (`api/`, `convex/`) use relative imports

**Type-only imports:**
- Must use `import type { ... }` because `verbatimModuleSyntax` is enabled
- Example: `import type { ConversationMode } from "../components/ModeSelector"` in `src/api/agents.ts`

## Error Handling

**Patterns:**
- API and service functions `throw new Error("descriptive message")` on misconfiguration or upstream failure — e.g. `getAgentForMode` throws `"No agent ID configured for mode: ${mode}..."` in `src/api/agents.ts`
- Error messages are user-facing strings that include actionable context (env var names, status codes)
- React components use `try/catch` around network calls and flip UI state to `"error"` — see `UploadDialog.tsx` document `status` field (`"uploading" | "success" | "error"`)
- HTTP handlers in `api/` and `src/index.ts` return `Response` with appropriate status codes; no central error middleware

## Logging

**Framework:** `console` (no dedicated logger)

**Patterns:**
- `console.error` for caught exceptions in backend handlers
- No structured logging, no log levels, no correlation IDs

## Comments

**When to Comment:**
- Header comments describing purpose of constants — e.g. `// Subject ID → display name mapping (must match SubjectSelector)` in `src/api/agents.ts`
- Inline rationale for non-obvious logic (cleanup in tests, mock restore)
- JSDoc-style block comments rare; `playwright.config.ts` uses them for generated config

**JSDoc/TSDoc:**
- Not systematically used; type signatures serve as documentation

## Function Design

**Size:** Small to medium; most exported functions fit in 10-40 lines (see `buildFullPrompt`, `resolveSubjectNames` in `src/api/agents.ts`)

**Parameters:**
- Single-object parameter pattern for 2+ related args — `getAgentForMode({ mode, subjects })` with typed `GetAgentRequest`
- Positional args for 1-2 simple primitives — `resolveSubjectNames(subjectIds)`, `getConversationToken(agentId)`

**Return Values:**
- Async functions return typed `Promise<T>` with explicit response interfaces — `Promise<GetAgentResponse>`
- Pure helpers return primitives or plain objects

## Module Design

**Exports:**
- Named exports only; no `export default` observed in API modules
- Components use named exports: `export function UploadDialog(...)`
- Types/interfaces exported alongside functions from same module

**Barrel Files:**
- Not used; consumers import directly from source file paths
- `src/components/ui/` houses shadcn primitives imported individually

## React / Frontend Idioms

- Function components with hooks only — no class components
- `useCallback` for memoizing functions passed to child components or used in effects
- `useRef<HTMLInputElement>(null)` pattern for DOM refs
- Auth access via `const { getToken } = useAuth()` from `@clerk/clerk-react`, wrapped through `authFetch(getToken, url, init)` helper in `src/lib/authFetch.ts`
- Tailwind classes composed via `cn(...)` utility (`clsx` + `tailwind-merge`) from `src/lib/utils.ts`
- Lucide icons imported as named components: `import { Upload, File, X, Loader2 } from "lucide-react"`
- Radix UI primitives wrapped locally in `src/components/ui/`

## Backend Idioms

- Env-var-driven configuration; lookups fail fast with descriptive errors
- Mode/subject mappings as `Record<Key, string>` lookup tables at module scope
- Prompt assembly via string concatenation of base + conditional sections (`buildFullPrompt`)
- Clerk JWT validation on the Vercel serverless layer (`api/_lib/auth.ts`)
- Convex functions grouped by domain file (`conversations.ts`, `users.ts`) with generated types in `convex/_generated/`

---

*Convention analysis: 2026-04-21*
