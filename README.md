# PODU — Interactive AI Podcast

> Built for the first [ElevenLabs Hackathon](https://elevenlabs.io) in Copenhagen, hosted by [AI Tinkerers](https://copenhagen.aitinkerers.org).

PODU (Podcast Dialogue Universe) is a local web app that lets you have real-time voice conversations with AI podcast hosts. Pick your topics, choose a conversation style, and start talking.

Three conversation modes with distinct personalities:

- **Fun** — Dry wit and skeptical humor (think British panel show energy)
- **Educational** — Clear explanations that build genuine understanding
- **Deep** — Philosophical exploration that challenges assumptions

Runs locally with nothing but an ElevenLabs API key and three agent IDs. Your ElevenLabs API key is entered in Settings and stored server-side. Clerk accounts are optional: add a publishable key to enable the welcome, sign-up, sign-in, and account-management flows. Clone, set env vars, `bun dev`.

> Looking for Convex storage and billing? See the [`full-version`](../../tree/full-version) branch.

## Tech Stack

| Layer    | Technology                                                     |
| -------- | -------------------------------------------------------------- |
| Runtime  | [Bun](https://bun.sh)                                          |
| Frontend | React 19, TypeScript, Tailwind CSS 4, Shadcn/UI                |
| Voice AI | [ElevenLabs](https://elevenlabs.io) Conversational AI (WebRTC) |

## Prerequisites

- [Bun](https://bun.sh) v1.1+ installed
- An [ElevenLabs](https://elevenlabs.io) account with API access

## Getting Started

### 1. Clone and install

```bash
git clone https://github.com/ManuelThomsen/podu.git
cd podu
bun install
```

### 2. Set up ElevenLabs agents

Create three conversational AI agents in the [ElevenLabs dashboard](https://elevenlabs.io/app/conversational-ai). Each agent corresponds to a conversation mode (fun, educational, deep). Copy the system prompts from [`src/api/agentPrompts.ts`](src/api/agentPrompts.ts) into each agent's configuration, then note down the agent IDs.

### 3. Configure environment variables

```bash
cp .env.example .env
```

Fill in your credentials:

```env
ELEVENLABS_API_KEY=sk_...
ELEVENLABS_AGENT_ID_FUN=agent_...
ELEVENLABS_AGENT_ID_EDU=agent_...
ELEVENLABS_AGENT_ID_DEEP=agent_...
```

The API key is optional here — you can also enter it in the app's Settings panel after starting the server. It's sealed server-side into an httpOnly cookie and never exposed to the browser bundle.

### 4. Run the dev server

```bash
bun dev
```

Open [http://localhost:3000](http://localhost:3000), pick your topics and mode, and start a conversation.

## Clerk accounts

Set `BUN_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...` in `.env.local` to enable accounts with your existing Clerk development instance. Restart `bun dev` after changing it. The frontend includes only this publishable key; keep `CLERK_SECRET_KEY` server-side.

With Clerk enabled, signed-out visitors see the welcome page, `/sign-up` and `/sign-in` use branded Clerk forms, and signed-in users enter the conversation workspace with profile and sign-out controls. `/welcome` is also available for previewing the public page. Without a publishable key, `/` and `/app` keep working as the local app.

The frontend sends a fresh Clerk bearer token with each API request. **The current local server does not validate these tokens or isolate users' documents.** Coordinate server authentication and user-owned storage before launching publicly. See [frontend readiness and backend handoff](FRONTEND_READINESS.md).

## Scripts

| Command                | Description                               |
| ---------------------- | ----------------------------------------- |
| `bun dev`              | Start dev server with hot reload          |
| `bun start`            | Start production server                   |
| `bun run build`        | Build for production (outputs to `dist/`) |
| `bun test`             | Run unit tests                            |
| `bun run test:e2e`     | Run Playwright end-to-end tests           |
| `bun run audit:agents` | Validate ElevenLabs agent configuration   |

## Project Structure

```
src/
  index.ts              # Bun HTTP server (API routes + static serving)
  frontend.tsx          # React entry point (client-side)
  App.tsx               # Root component
  api/
    agents.ts           # Agent resolution + conversation tokens
    agentPrompts.ts     # System prompts for each conversation mode
    knowledgebase.ts    # Document store for context injection (SQLite-backed)
    auditAgents.ts      # ElevenLabs agent configuration validator
  components/
    WelcomePage.tsx     # Public introduction and account entry points
    ClerkApp.tsx        # Clerk account pages, session handling, profile controls
    LandingPage.tsx     # Main app view (topic + mode selection)
    ConversationView.tsx # Active conversation UI with waveform
    SubjectSelector.tsx # Topic picker (1-3 topics)
    ModeSelector.tsx    # Conversation mode picker
    ApiKeySettings.tsx  # In-app ElevenLabs API key entry (server-side sealed)
    UploadDialog.tsx    # Knowledge base upload modal
    ui/                 # Shadcn/UI components
  lib/
    db.ts               # bun:sqlite singleton (lazy, hot-reload safe)
    session.ts          # iron-session sealed-cookie API key storage
    poduApi.ts          # Typed client-side API seam
```

## How It Works

1. The Bun server transpiles the React frontend at request time
2. User selects 1-3 topics and a conversation mode, then hits play
3. The server resolves the mode to an ElevenLabs agent ID, builds a system prompt with topic constraints and any uploaded knowledge-base context, and returns a conversation token
4. The frontend establishes a WebRTC connection to the ElevenLabs agent for real-time voice

## License

MIT — see [LICENSE](LICENSE).
