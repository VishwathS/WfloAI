# WfloAI — CLAUDE.md

## Project Purpose

WfloAI is a visual AI workflow builder. Users create workflows by connecting nodes on a canvas, then run them to chain AI operations. The core loop: drag nodes onto the canvas → connect them → click Run → watch AI stream results through the graph.

---

## Implemented Features

- **Google OAuth** via Supabase Auth with cookie-based sessions
- **Dashboard** — list all workflows with last-run timestamp, delete
- **Canvas editor** — React Flow canvas with drag-and-drop node creation
- **Four node types** — Trigger, AI, Router, Action
- **Auto-save** — 700ms debounced PATCH to `/api/workflows/[id]` on every canvas change
- **Workflow execution** — client-side topological traversal, streams AI output live
- **Router node** — AI-evaluated conditional branching (true/false paths)
- **Execution log** — collapsible panel showing per-node status, output, duration
- **Execution persistence** — POST to `/api/workflows/[id]/logs` after each run
- **RLS-enforced multi-tenancy** — users see only their own data at the DB level

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Framework | Next.js (App Router) | 14.2.35 |
| Language | TypeScript | 5.7 |
| Canvas | React Flow | 11.11.4 |
| Backend | Supabase (Postgres + Auth) | `@supabase/ssr` 0.5 |
| AI | Anthropic SDK | 0.96 |
| Styling | Tailwind CSS | 3.4 |
| Icons | Lucide React | 0.511 |
| Runtime | Node.js | 22.x |

No Redux, Zustand, or other state managers. State is React hooks + React Context + React Flow internal state.

---

## Architecture Rules

### Next.js App Router conventions
- **Server Components** for auth-gated data fetching (dashboard page, workflow editor page)
- **Client Components** (`"use client"`) for all canvas and interactive UI
- **Server Actions** for mutations that don't need a REST API (e.g., create workflow)
- **API routes** (`app/api/`) for streaming responses and operations called from client-side hooks

### Supabase client usage
- Use `lib/supabase/server.ts → createServerSupabaseClient()` in Server Components and API routes
- Use `lib/supabase.ts → createBrowserSupabaseClient()` in Client Components
- Never use the service role key or bypass RLS

### Execution engine
- Lives entirely in `lib/execution/` — pure TypeScript, no React dependencies
- `executor.ts` drives the traversal; `topologicalSort.ts` orders nodes; `types.ts` defines events
- The executor communicates with React via the `onEvent` callback — never import React into `lib/execution/`
- New node types must be handled in `executor.ts` with an explicit `throw new Error('Unsupported node type')` fallback

### API routes
- All routes in `app/api/` must call `supabase.auth.getUser()` before any operation and return 401 if unauthenticated
- Validate all incoming payloads — use guard functions (`isValidGraph`, `isValidNodeResults`) before writing to DB
- `/api/execute` streams via `ReadableStream` with `text/plain` content-type — do not change this without updating `requestAIText()` in `executor.ts`

---

## Data Models

### `Workflow` (DB table: `public.workflows`)
```ts
interface Workflow {
  id: string;            // uuid, PK
  user_id: string;       // uuid, FK → auth.users (cascade delete)
  name: string;
  description: string | null;
  graph: WorkflowGraph;  // stored as JSONB
  created_at: string;    // ISO UTC
  updated_at: string;    // ISO UTC, auto-updated by DB trigger
}
```

### `WorkflowGraph`
```ts
interface WorkflowGraph {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

interface WorkflowNode<TData = WorkflowNodeData> {
  id: string;
  type: string;          // "triggerNode" | "aiNode" | "routerNode" | "actionNode"
  position: { x: number; y: number };
  data: TData;
}

interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;   // "true" | "false" on RouterNode outputs
  targetHandle?: string | null;
  data?: Record<string, unknown>;
}
```

### Node data shapes
```ts
type TriggerNodeData  = { label: string; type: "Manual" | "Webhook" | "File Upload" }
type AINodeData       = { label: string; action: AIActionType; prompt: string }
type RouterNodeData   = { label: string; prompt: string }
type ActionNodeData   = { label: string; action: "Save Output" | "Log Result" | "Display" }
```

### `ExecutionLogRow` (DB table: `public.execution_logs`)
```ts
interface ExecutionLogRow {
  id: string;
  workflow_id: string;
  user_id: string;
  ran_at: string;
  node_results: Array<{
    nodeId: string;
    status: "idle" | "running" | "complete" | "error";
    output: string;
    durationMs?: number;
  }>;
}
```

### RouterNode edge convention
Router nodes have exactly two output handles: `"true"` and `"false"`. The executor filters outgoing edges by matching `edge.sourceHandle` to the AI's response string. Any future conditional node type must follow this same handle-naming convention.

---

## Coding Conventions

- **No comments** unless the reason is non-obvious. Never narrate what the code does.
- **No error handling for impossible states.** Trust TypeScript types and RLS.
- **No premature abstractions.** Three similar lines is better than a premature helper.
- **No `any`.** Use proper types from `lib/types.ts`; extend that file when needed.
- **Tailwind only** for styling. No CSS modules, no inline `style` props.
- **Node type strings are literals:** `"triggerNode"`, `"aiNode"`, `"routerNode"`, `"actionNode"`. These must match across React Flow node registration, the executor switch, and the DB-stored graph.
- **Execution events** are typed in `lib/execution/types.ts` — extend the union there; never use raw string event types.
- Import paths use the `@/` alias (mapped to project root).
- Never put secrets in `NEXT_PUBLIC_` env vars. Client-accessible vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` only.

---

## Constraints for Future Development

### Adding a new node type
1. Add its data interface to `lib/types.ts` and include it in the `WorkflowNodeData` union
2. Create the React Flow node component in `components/canvas/nodes/`
3. Register it in `nodeTypes` in `WorkflowCanvas.tsx`
4. Handle it in `executor.ts` before the final `throw new Error('Unsupported node type')`
5. Add it to the draggable library in `NodeSidebar.tsx`
6. Update `isValidConnection` in `WorkflowCanvas.tsx` if it needs connection constraints

### Adding a new API route
- Auth-check first via `createServerSupabaseClient().auth.getUser()`
- Return consistent error shapes: `{ error: string }` with appropriate HTTP status
- Streaming routes must return `ReadableStream` with `text/plain`

### Database migrations
- New files go in `supabase/migrations/` with prefix `YYYYMMDDNNNN_description.sql`
- All new tables must have RLS enabled with per-user `auth.uid() = user_id` policies
- Any change to the `graph` JSONB shape requires both a migration and a `lib/types.ts` update
- All user-data tables need `user_id uuid references auth.users(id) on delete cascade`

### Execution engine
- Runs in the browser — no Node.js-only APIs in `lib/execution/`
- No React or Next.js imports in `lib/execution/`

---

## What NOT to Break

| Invariant | Why |
|---|---|
| `graph` JSONB shape matches `WorkflowGraph` in `lib/types.ts` | No schema migration layer — a mismatch silently corrupts the canvas on load |
| `sourceHandle: "true" \| "false"` on RouterNode edges | Executor matches these strings exactly; any other value silently drops that branch |
| Node type string literals consistent across canvas, executor, and DB | Mismatch causes nodes to be skipped silently during execution |
| RLS policies on `workflows` and `execution_logs` | Only DB-level access control — weakening them exposes all users' data |
| `/api/execute` streams `text/plain` chunks | `requestAIText()` reads raw chunks; changing format breaks AI node streaming |
| `updateSession()` in middleware on every request | Without it, sessions don't refresh and users get logged out unexpectedly |
| `createServerSupabaseClient()` in API routes (not browser client) | Browser client in server context breaks cookie-based auth |
| 700ms debounce on auto-save in `WorkflowCanvasShell` | Without it, every React Flow state change fires a PATCH — floods the DB |
| Cycle detection in `topologicalSort.ts` | Without it, cyclic graphs hang the browser tab indefinitely |
