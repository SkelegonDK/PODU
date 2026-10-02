# Frontend readiness and backend handoff

The frontend now supports the existing PODU Clerk instance with a branded welcome page, dedicated sign-up/sign-in pages, and profile/sign-out controls. The topic/style workflow and API response contracts remain compatible with the local server.

## Configuration and routes

- Set `BUN_PUBLIC_CLERK_PUBLISHABLE_KEY` in `.env.local`, then restart the server. The same variable is compiled explicitly for production builds. Only the publishable key is exposed.
- With a key: `/` shows the welcome page when signed out and the workspace when signed in. `/sign-up` and `/sign-in` render Clerk's complete built-in flows, including verification, social authentication, recovery, and MFA according to the instance settings. Multi-step forms use hash routing.
- `/welcome` always provides the public introduction, even if account access is unavailable.
- Without a key: `/` and `/app` run the local app; account pages explain that account access is unavailable and offer the local preview.
- The existing development publishable key is configured in this checkout's ignored `.env.local`. No secret keys were copied, and no Clerk instance settings were changed.

## Backend integration required before public launch

1. Verify Clerk session tokens on API routes. `src/lib/poduApi.ts` now attaches `Authorization: Bearer <session token>` using Clerk's fresh `getToken()` getter on every request while the signed-in workspace is mounted. Failed token refreshes stop the request and offer sign-in recovery.
2. Require authentication and scope all document list/upload/read/delete operations to the authenticated user. The current SQLite library is shared by the local server.
3. Configure the service's ElevenLabs key and agent IDs server-side. Production users should not need to provide their own ElevenLabs key. The local Settings flow remains available for development; a configured service does not show its setup notice.
4. Confirm the backend can return the existing `/api/config` status and `/api/agents` session contracts. The frontend still uses these to gate starting a conversation and display recoverable failures.
5. Configure production Clerk keys, allowed domains, and desired authentication methods. The existing instance currently requests a username at signup; consider email-only signup if usernames have no product purpose. Configure real privacy/terms URLs through Clerk when the policies are ready.

**Frontend session gating is not API authorization.** API verification and per-user data isolation remain the backend thread's work. No API authorization, storage schema, billing, or account data migration was implemented here.

## User experience changes

- Ghost-white welcome/account pages and a slate-blue workspace using the supplied blue slate, glaucous, pale sky, ghost white, and vibrant coral palette. Uncut Sans is used throughout, including Clerk forms. Coral is reserved for accents, with error-text tints for readable contrast.
- Removed the two continuously rendered WebGL backgrounds, neon gradients, clipped topic labels, and the blocking first-run Settings modal.
- Visible focus, a skip link, labeled controls, announced selection and failure states, 44px minimum control targets, scrollable phone-sized dialogs, and reduced-motion support.
- Settings supports Enter submission and links validation errors to the input.
- Voice controls distinguish microphone muting from speaker muting. A collapsible transcript displays SDK messages for the current visit only; it is not persisted by PODU's frontend. Voice providers may retain conversation data according to their configuration.
- Microphone permission-check tracks stop immediately. Leaving during setup cancels subsequent work; closing returns keyboard focus to Start conversation.
- Failed document removal preserves the server ID so retry really removes the server document. Uploading files cannot be removed while their request is pending.

## Validation

- `bun test`: unit tests, including bearer token refresh, expired-session behavior, and local fallback.
- `bunx tsc --noEmit`: TypeScript checks.
- `bun run build`: production build.
- `bunx playwright test --workers=2`: Chromium, WebKit, and mobile flows plus automated axe checks. The test server uses its own port (3210 by default) and explicitly disables Clerk to keep local-flow tests deterministic. Set `PODU_E2E_PORT` to change it.
- `PODU_LIVE_AUTH_URL=http://localhost:3101 bunx playwright test tests/clerk-smoke.e2e.ts --workers=2`: opt-in smoke tests against a running Clerk-enabled development preview across all three browser projects. They check the real forms, narrow layout, labels, required-field focus, and automated accessibility without submitting credentials or creating accounts.

On October 2, 2026: 87 unit tests passed, TypeScript and the production build passed, and the complete browser run with live Clerk enabled passed 89 tests with four desktop-only touch tests skipped. Automated axe checks covered public/account pages, the workspace, dialogs, and conversation controls.

After applying the supplied palette and Uncut Sans throughout, 27 targeted local browser checks and three live Clerk accessibility checks passed across Chromium, WebKit, and mobile. TypeScript and the production build also passed.

Clerk's footer needs an opaque paragraph color over its development overlay to pass contrast checks. This is a nested appearance selector, so rerun the live auth accessibility checks after Clerk UI updates; Clerk reports a development warning about this customization.

Automated accessibility checks do not establish full WCAG compliance. Complete signup/verification, social-provider redirects, MFA/recovery, profile/sign-out, and an actual voice conversation still need an end-to-end check using a test account and the integrated backend before release.
