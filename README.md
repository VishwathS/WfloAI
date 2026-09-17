# WfloAI

WfloAI is an AI-first visual workflow builder built with Next.js 16, TypeScript, Tailwind CSS, shadcn-style UI primitives, Supabase, React Flow, and Anthropic.

The app currently supports:

- Google OAuth login with Supabase Auth, behind an invite gate
- A public marketing page, privacy policy, terms and help page; the dashboard lives at `/dashboard`
- Workflow creation, listing, rename, and deletion
- A React Flow canvas with nine step types: Trigger, Input, File Input, AI, Router, Lookup, Gmail, HTTP Request, and Action
- Drag-and-drop node creation, resizable nodes, and debounced auto-save
- Workflow graph persistence to Supabase
- Server-side execution with node-by-node state, streaming AI output, and an execution log
- Run history with pagination, and automatic retention
- Scheduled runs via Inngest, with an interval floor, per-user caps and auto-disable on repeated failure
- Gmail sending (Send only in V1) and an HTTP Request step, both server-execution-only
- Account deletion and a JSON data export

## Stack

- Next.js 16 App Router, React 19
- TypeScript with strict mode
- Tailwind CSS
- shadcn-style UI components
- Supabase for auth, Postgres and file storage
- React Flow for the visual builder
- Anthropic for AI step execution, Tavily for Lookup
- Inngest for scheduled and background runs
- Vitest for unit tests

## Prerequisites

- Node.js 22.x
- A Supabase project
- An Anthropic API key
- A Tavily API key (Lookup steps)
- A Google Cloud OAuth client (Gmail steps), separate from the Supabase login provider

## Environment Variables

Create `.env.local` from `.env.local.example` and fill in:

```bash
cp .env.local.example .env.local
```

Required values:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `ANTHROPIC_API_KEY`

`.env.local` is ignored by git. Keep real secrets there only.

### Production environment

Production requires more than local development does, and the application
**refuses to start** if any of these is missing when `NODE_ENV=production`
(`instrumentation.ts` → `lib/config/env.ts`). The check exists because a
missing signing key otherwise fails silently.

| Variable | Why it is required |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Every Supabase client |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Every Supabase client |
| `SUPABASE_SERVICE_ROLE_KEY` | The Inngest execution path and account deletion. Server-only |
| `ANTHROPIC_API_KEY` | AI and Router nodes |
| `TAVILY_API_KEY` | Lookup nodes |
| `INTEGRATION_TOKEN_KEY` | Decrypts stored Gmail tokens and credentials. **Back it up — see [docs/KEY-RECOVERY.md](docs/KEY-RECOVERY.md)** |
| `GOOGLE_CLIENT_ID` | The Gmail OAuth client (not the Supabase login provider) |
| `GOOGLE_CLIENT_SECRET` | The Gmail OAuth client |
| `INNGEST_EVENT_KEY` | Publishing `workflow/schedule.due`. Unset means schedules never fire — a loud failure |
| `INNGEST_SIGNING_KEY` | Authenticating `/api/inngest`. Unset means that endpoint accepts **unsigned** requests into the service-role execution path — a silent failure |

Optional, with safe defaults:

| Variable | Default | Notes |
|---|---|---|
| `GMAIL_READ_ACTIONS_ENABLED` | off | Must be exactly `"true"` to enable. Gates every Gmail action except Send, Create Draft included |
| Error reporter DSN | none | Registered through `setErrorTransport()`; until then errors go to stderr as structured lines |

The two Inngest keys are **not interchangeable** and confusing them is the
reason the startup check names them separately. `.env.local.example` documents
the distinction in full.

**Never put a secret in a `NEXT_PUBLIC_` variable.** The only client-visible
values are the Supabase URL and anon key.

## Setup

1. Install dependencies:

```bash
npm install
```

On Windows PowerShell with `nvm-windows`, prefer:

```powershell
npm.cmd install
```

2. Configure Supabase Auth:

- Enable the Google provider
- Add `http://localhost:3000/auth/callback` as an authorized redirect URL

3. Run the database migrations in Supabase:

- Open the SQL editor in Supabase
- Run every file in [`supabase/migrations/`](supabase/migrations/) in filename order. They are named
  `YYYYMMDDNNNN_description.sql`, and order matters.
- Applying migrations to a **remote** project is a deliberate operator action. This working copy has
  a live Supabase CLI project link, so `supabase db push` targets a remote project by default.

4. Start the development server:

```bash
npm run dev
```

On Windows PowerShell with `nvm-windows`, prefer:

```powershell
npm.cmd run dev
```

5. Open:

```text
http://localhost:3000
```

## Execution Notes

- Execution order is a topological sort; a cycle in the graph is an execution error
- The primary run path is `POST /api/workflows/[id]/execute`, which traverses the whole graph
  server-side via `lib/execution/serverExecutor.ts` and streams SSE to the client
- Scheduled runs take the same executor through Inngest, without SSE
- `/api/execute` is the older single-step endpoint used by the browser-side executor; it streams
  `text/plain`
- Gmail and HTTP Request steps run **only** on the server, so credentials never reach the browser

Both AI paths use:

- Model: `claude-haiku-4-5-20251001`
- `max_tokens: 4096`
- Streaming text output, with an abort timeout

## Scripts

```bash
npm run dev        # Next dev server (Turbopack)
npm run build      # production build
npm run start      # serve the production build
npm run lint       # eslint, flat config
npm run typecheck  # tsc --noEmit
npm test           # vitest run
```

CI runs lint, typecheck, test and build on every pull request
([`.github/workflows/ci.yml`](.github/workflows/ci.yml)). `npm audit` runs alongside them and
reports without blocking.

## Windows PowerShell Note

If `node`, `npm`, or `npm.cmd` are not recognized inside VS Code but `where.exe node` works in another shell, restart all VS Code windows and open a fresh terminal so it picks up the updated `PATH` from `nvm-windows`.

## Project Structure

- `app/(auth)/login/page.tsx`: login page
- `app/auth/callback/route.ts`: OAuth callback handler
- `app/(marketing)`: public homepage, privacy, terms, help
- `app/(dashboard)/dashboard/page.tsx`: dashboard
- `app/(dashboard)/workflows/[id]/page.tsx`: workflow editor page
- `app/api/workflows/[id]/route.ts`: workflow graph save endpoint
- `app/api/execute/route.ts`: authenticated Anthropic streaming endpoint
- `components/canvas`: React Flow canvas, toolbar, execution context, and log UI
- `components/canvas/nodes`: the nine step components
- `components/canvas/edges`: custom edge rendering and deletion
- `hooks/use-user.ts`: current session/user hook
- `hooks/useExecution.ts`: workflow execution state hook
- `lib/supabase.ts`: browser Supabase client
- `lib/supabase/server.ts`: server and middleware Supabase clients
- `lib/execution`: executors, validation, and runtime limits
- `lib/integrations`, `lib/gmail`, `lib/http`: integration, quota and egress safety
- `lib/retention`: retention periods and the sweep predicates
- `lib/config/env.ts`: the required-variable startup check
- `lib/types.ts`: shared workflow and node data types
- `proxy.ts`: route protection and the invite gate (Next 16 renamed the middleware convention)
- `docs/KEY-RECOVERY.md`: what INTEGRATION_TOKEN_KEY protects and how to restore it

## Current Workflow Data Model

Workflows are stored in Supabase with a `graph` JSONB column shaped like:

```ts
{
  nodes: [],
  edges: []
}
```

Each workflow belongs to a single authenticated user, enforced with row-level security.

## Safe Git Workflow

Before committing:

```bash
git status --short
git diff --cached
```

Make sure `.env.local` is never staged. Only `.env.local.example` should be committed.
