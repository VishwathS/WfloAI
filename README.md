# WfloAI

WfloAI is an AI-first visual workflow builder built with Next.js 14, TypeScript, Tailwind CSS, shadcn-style UI primitives, Supabase, React Flow, and Anthropic.

The app currently supports:

- Google OAuth login with Supabase Auth
- Protected dashboard routes
- Workflow creation, listing, rename, and deletion
- React Flow canvas with trigger, AI, and action nodes
- Drag-and-drop node creation and animated edges
- Workflow graph persistence to Supabase
- Phase 3 execution with node-by-node state, streaming AI output, and an execution log

## Stack

- Next.js 14 App Router
- TypeScript with strict mode
- Tailwind CSS
- shadcn-style UI components
- Supabase for auth and Postgres storage
- React Flow for the visual builder
- Anthropic for AI node execution

## Prerequisites

- Node.js 22.x
- A Supabase project
- An Anthropic API key

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
- Run [supabase/migrations/202605140001_init_flowai.sql](/c:/Users/vishw/wflo-AI/supabase/migrations/202605140001_init_flowai.sql:1)
- Then run [supabase/migrations/202605150001_add_execution_logs.sql](/c:/Users/vishw/wflo-AI/supabase/migrations/202605150001_add_execution_logs.sql:1)

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

- Trigger nodes simulate a workflow start and emit `"Workflow triggered."`
- AI nodes call Anthropic through the authenticated server route at `/api/execute`
- Action nodes simulate completion and emit `"Output saved."`
- Workflow execution order is determined by topological sort
- Cycles in the graph throw an execution error

The Anthropic route uses:

- Model: `claude-sonnet-4-20250514`
- `max_tokens: 1024`
- Streaming text output

## Scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
```

## Windows PowerShell Note

If `node`, `npm`, or `npm.cmd` are not recognized inside VS Code but `where.exe node` works in another shell, restart all VS Code windows and open a fresh terminal so it picks up the updated `PATH` from `nvm-windows`.

## Project Structure

- `app/(auth)/login/page.tsx`: login page
- `app/auth/callback/route.ts`: OAuth callback handler
- `app/(dashboard)/page.tsx`: dashboard
- `app/(dashboard)/workflows/[id]/page.tsx`: workflow editor page
- `app/api/workflows/[id]/route.ts`: workflow graph save endpoint
- `app/api/execute/route.ts`: authenticated Anthropic streaming endpoint
- `components/canvas`: React Flow canvas, toolbar, execution context, and log UI
- `components/canvas/nodes`: custom Trigger, AI, and Action nodes
- `components/canvas/edges`: custom edge rendering and deletion
- `hooks/use-user.ts`: current session/user hook
- `hooks/useExecution.ts`: workflow execution state hook
- `lib/supabase.ts`: browser Supabase client
- `lib/supabase/server.ts`: server and middleware Supabase clients
- `lib/execution`: pure execution utilities
- `lib/types.ts`: shared workflow and node data types
- `middleware.ts`: route protection

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
