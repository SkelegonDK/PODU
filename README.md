# PODU — Interactive AI Podcast

> Built for the first [ElevenLabs Hackathon](https://elevenlabs.io) in Copenhagen, hosted by [AI Tinkerers](https://copenhagen.aitinkerers.org).

PODU (Podcast Dialogue Universe) is a local web app that lets you have real-time voice conversations with AI podcast hosts. Pick your topics, choose a conversation style, and start talking.

Three conversation modes with distinct personalities:

- **Fun** — Dry wit and skeptical humor (think British panel show energy)
- **Educational** — Clear explanations that build genuine understanding
- **Deep** — Philosophical exploration that challenges assumptions

PODU now uses **Clerk + Convex** for accounts and durable conversations, and **Eleven v4 Turbo** through ElevenAgents for interruptible voice conversations with a lead host and cohost. Topic memory updates run in the background. Users can view transcripts, continue earlier conversations, and opt into saving audio for replay.

See [backend upgrade and deployment notes](docs/backend-upgrade.md) for setup, verified changes, remaining live integration, memory settings, and recording access control. The `full-version` branch preserves the older SaaS implementation; the current branch restores the integrations with account-scoped access.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | [Bun](https://bun.sh) |
| Frontend | React 19, TypeScript, Tailwind CSS 4, Shadcn/UI |
| Voice AI | ElevenAgents, Eleven v4 Turbo, WebRTC |
| Authentication | Clerk |
| Persistence | Convex database + file storage |

See `convex/` for the authenticated document/conversation functions, memory worker, recording worker, and webhook endpoint.

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

### 3. Configure Clerk and Convex

Use your Clerk app's `convex` JWT template. Configure the Clerk credentials, issuer URL, and Convex URL from `.env.example`. Set the issuer, ElevenLabs API key, and three agent IDs in the Convex environment too. Deploy the development backend:

```bash
bunx convex dev --once
```

For final transcripts and saved audio, configure an ElevenLabs signed post-call transcription webhook at `<CONVEX_SITE_URL>/webhooks/elevenlabs` and set `ELEVENLABS_WEBHOOK_SECRET` in Convex. See the [deployment notes](docs/backend-upgrade.md) for the separate memory summarizer and remaining production work.

### 4. Configure environment variables

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

SaaS mode uses a server-managed key in Convex. The optional local demo supports entering a personal key in Settings, stored in an encrypted HttpOnly cookie.

### 5. Run the dev server

```bash
bun dev
```

Open [http://localhost:3000](http://localhost:3000), sign in, pick your topics and mode, and start a conversation. For an explicit localhost-only demo without Clerk/Convex, use `bun run dev:local`.

## Scripts

| Command | Description |
|---------|-------------|
| `bun dev` | Start dev server with hot reload |
| `bun run dev:local` | Start localhost-only SQLite demo |
| `bun start` | Start production server |
| `bun run build` | Build for production (outputs to `dist/`) |
| `bun test` | Run unit tests |
| `bun run test:backend` | Test Convex ownership, transcripts, and webhook completion |
| `bun run typecheck` | Check TypeScript |
| `bun run upgrade:agents` | Preview agent updates (`--apply` to apply) |
| `bun run test:e2e` | Run Playwright end-to-end tests |
| `bun run audit:agents` | Validate ElevenLabs agent configuration |

## Project Structure

```
src/
  index.ts              # Bun HTTP server (API routes + static serving)
  frontend.tsx          # React entry point (client-side)
  App.tsx               # Root component
  api/
    agents.ts           # Agent resolution + conversation tokens
    agentPrompts.ts     # System prompts for each conversation mode
    knowledgebase.ts    # File parsing and local demo document store
    podcastProfile.ts   # v4 Turbo two-host agent profile
    auditAgents.ts      # ElevenLabs agent configuration validator
  components/
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
    poduApi.ts          # Typed, authenticated client-side API seam
```

## How It Works

1. Clerk signs the user in; Convex verifies the same identity for all data access.
2. The user selects 1–3 topics, a mode, and whether to save a replay.
3. Bun loads their documents and relevant topic memory; Convex reserves an authenticated ElevenLabs session token.
4. The browser connects to ElevenAgents over WebRTC; voice switching uses a configured cohost and v4 audio tags.
5. Transcript batches and topic compaction run separately from voice responses. A signed provider webhook finalizes the transcript and schedules recording archival.
6. History supports transcripts, replay, topic continuation, and archive deletion.

## License

MIT — see [LICENSE](LICENSE).
