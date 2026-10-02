# Frontend readiness and backend integration

The refined frontend is integrated with the Clerk + Convex backend from main. It preserves the topic/style workflow, branded account pages, supplied palette, and Uncut Sans while retaining saved conversations, recording consent, transcript syncing, and topic memory.

## Configuration and routes

- SaaS is the default. Set `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CONVEX_URL`, and the other server settings in `.env.example`. `BUN_PUBLIC_CLERK_PUBLISHABLE_KEY` remains a supported publishable-key alias. Restart the server after configuration changes.
- Bun and the production build expose only the explicit public configuration: local-mode flag, Clerk publishable key, and Convex URL. Secret keys are never included.
- `/` shows the welcome page when signed out and the workspace when signed in. `/sign-up` and `/sign-in` use Clerk's complete built-in flows with hash routing. `/welcome` always provides the public introduction.
- Missing SaaS credentials do not enable a local workspace or bypass authentication. Account pages show a recoverable unavailable state if Clerk is not configured.
- `bun run dev:local` explicitly enables the localhost-only SQLite demo. It bypasses Clerk and hides saved SaaS conversations; `/app` opens the local workspace. The backend rejects local mode in production and on non-localhost hosts.

## Integrated backend behavior

- The signed-in workspace installs Clerk's fresh `getToken({ template: "convex" })` getter before its first API request. Expired or failed token refreshes stop requests and offer sign-in recovery. Bun verifies the JWT audience and allowed origin; Convex scopes data to the authenticated owner.
- One branded Clerk provider owns account entry and profile controls. Convex's Clerk integration is mounted within it when a deployment URL is configured.
- Preparing a conversation retains recording consent and an optional continuation ID. Its returned conversation ID accompanies the token request, transcript batches, completion, and memory retrieval.
- The current ElevenLabs SDK runs within a `ConversationProvider`. SDK role/event IDs feed both the visible transcript and the retry-safe transcript queue; agent corrections update both. Changed topic notes are delivered silently while listening.
- SaaS transcripts and topic notes are saved to the account. Recording replay is opt-in, with an explicit provider-retention disclosure. The local demo's visible transcript is transient.
- Personal ElevenLabs Settings is available only in local mode. SaaS users see service setup guidance when the app owner's configuration is incomplete.

See [backend deployment notes](docs/backend-upgrade.md) for the live credentials, webhook, memory worker, recording storage, and remaining release checks. No live voice session or account was created during this frontend work.

## User experience changes

- Ghost-white welcome/account pages and a slate-blue workspace using blue slate, glaucous, pale sky, ghost white, and vibrant coral. Uncut Sans is used throughout, including Clerk forms. Coral is reserved for accents, with error-text tints for readable contrast.
- Removed continuously rendered WebGL backgrounds, neon gradients, clipped topic labels, and the blocking first-run Settings modal.
- Visible focus, a skip link, labeled controls, announced selection/failure states, generous control targets, phone-sized scrollable dialogs, and reduced-motion support.
- Settings supports Enter submission and associates errors with the input. Uploads support keyboard file selection and retry-safe document removal.
- Voice controls distinguish microphone muting from speaker muting. Permission-check tracks stop immediately; leaving during setup cancels further work and restores focus to Start conversation.

## Validation

- `bun test src/`: unit tests for agent configuration, local documents, token handoff, prepared-session contracts, transcript queues, memory, and webhook signatures.
- `bun run test:backend`: Convex ownership, transcripts, completion, and recording tests.
- `bun run typecheck` and `bun run build`: TypeScript and production build.
- `bunx playwright test --workers=2`: Chromium, WebKit, and mobile flows plus automated axe checks. The isolated server uses explicit local mode and port 3210 by default; `PODU_E2E_PORT` changes it.
- `PODU_LIVE_AUTH_URL=http://localhost:3101 bunx playwright test --workers=2`: also checks real Clerk forms, narrow layouts, labels, required-field focus, and accessibility without submitting credentials or creating users.

Clerk's footer uses opaque paragraph text over its development overlay, so rerun the live auth accessibility checks after Clerk UI updates. Clerk reports a development warning about this nested appearance customization.

Automated accessibility checks do not establish full WCAG compliance. Complete signup/verification, social redirects, MFA/recovery, profile/sign-out, live audio, webhook delivery, and recording replay still need an integrated test account check before release.

Merge validation on October 2, 2026: 97 unit tests and five Convex backend tests passed, together with TypeScript and the production build. The browser suite passed 86 local flow/accessibility checks (four desktop touch tests skipped); all three live Clerk smoke checks passed after restarting the preview server.
