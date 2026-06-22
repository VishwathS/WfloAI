# WfloAI — CLAUDE.md

## Project Purpose

WfloAI is a visual AI workflow builder. Users create workflows by connecting nodes on a canvas, then run them to chain AI operations. The core loop: drag nodes onto the canvas → connect them → click Run → watch AI stream results through the graph.

---

## Implemented Features

- **Google OAuth** via Supabase Auth with cookie-based sessions
- **Dashboard** — list all workflows with last-run timestamp, delete
- **Canvas editor** — React Flow canvas with drag-and-drop node creation
- **Five node types** — Trigger, AI, Router, Action, Lookup
- **Auto-save** — 700ms debounced PATCH to `/api/workflows/[id]` on every canvas change
- **Workflow execution** — client-side topological traversal, streams AI output live
- **Router node** — AI-evaluated conditional branching (true/false paths)
- **Execution log** — collapsible panel showing per-node status, output, duration
- **Execution persistence** — POST to `/api/workflows/[id]/logs` after each run
- **RLS-enforced multi-tenancy** — users see only their own data at the DB level
- **Node resizing** — drag bottom-right corner of any node; dimensions persist across saves/reloads

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
  type: string;          // "triggerNode" | "aiNode" | "routerNode" | "actionNode" | "lookupNode"
  position: { x: number; y: number };
  data: TData;
  style?: { width?: number; height?: number };  // persisted resize dimensions (flow units)
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
type LookupNodeData   = { label: string; query: string; maxResults: number }
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
- **Node type strings are literals:** `"triggerNode"`, `"aiNode"`, `"routerNode"`, `"actionNode"`, `"lookupNode"`. These must match across React Flow node registration, the executor switch, and the DB-stored graph.
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

### Node resizing

Node dimensions are stored in `node.style.width` and `node.style.height` (flow units). React Flow applies `node.style` as inline CSS to the `.react-flow__node` container, so the stored values directly control rendered size.

**Why `node.style`, not `node.data`:** `sanitizeNodes()` in `WorkflowCanvasShell.tsx` strips React Flow's internally-measured `width` and `height` fields before saving, but destructures only those two names. `style` falls through in `...rest` and is preserved through the auto-save pipeline unchanged.

**Persistence:** Dimensions are saved automatically via the existing 700ms debounced PATCH triggered by `setNodes()`. On reload, `node.style` is applied by React Flow before the first render.

**The `useNodeResize` hook (`hooks/useNodeResize.ts`):**
- Returns `{ containerRef, onResizePointerDown }`
- `containerRef` must be attached to the node's root `<div>`
- `onResizePointerDown` must be placed on a 16×16px zone at `absolute bottom-0 right-0`
- Calls `e.stopPropagation()` to prevent React Flow from starting a node drag
- Converts screen pixel delta to flow units via `delta / zoom` (zoom captured at drag start via `getZoom()`)
- `offsetWidth` / `offsetHeight` are CSS layout dimensions, unaffected by viewport `transform: scale(zoom)` — they are already in flow units; do NOT divide by zoom

**Layout convention for resizable nodes:**
- Root div: `relative flex h-full flex-col`
- Header div: `flex-shrink-0`
- Content div: `flex flex-1 min-h-0 flex-col gap-3 overflow-y-auto px-4 py-4`
- Textareas / primary content area: `flex-1 min-h-[...]`

**Adding resize to a new node type:**
1. Import `useNodeResize` from `@/hooks/useNodeResize`
2. Call `const { containerRef, onResizePointerDown } = useNodeResize(id)` in the component
3. Add `ref={containerRef}` and `relative flex h-full flex-col` to the root div
4. Add `flex-shrink-0` to the header div
5. Change the content div to `flex flex-1 min-h-0 flex-col gap-3 overflow-y-auto px-4 py-4`
6. Add `flex-1` to any textarea or primary content area (keep a `min-h-[...]` as the minimum)
7. Add `<div className="absolute bottom-0 right-0 h-4 w-4 cursor-se-resize" onPointerDown={onResizePointerDown} />` as the last child of the root div

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

### Lookup Node

**Configuration schema (`LookupNodeData`):**
```ts
interface LookupNodeData {
  label: string;
  query: string;      // template — supports {{input}} substitution with upstream context
  maxResults: number; // 1–10, default 5
}
```

**Execution flow:**
1. Executor calls `executeLookupNode` in `lib/execution/executor.ts`
2. `{{input}}` in `query` is replaced with the concatenated upstream context string
3. A POST is made to `/api/lookup` with `{ query, maxResults }`
4. The server calls Tavily and returns `{ output: string }` — plain-text formatted results
5. Executor emits `node:output` once (no streaming) then `node:complete`
6. Formatted results become the node's output and flow downstream as normal context

**Backend route:** `app/api/lookup/route.ts`
- Auth-gated via `createServerSupabaseClient().auth.getUser()`
- Reads `TAVILY_API_KEY` from env (server-only — never `NEXT_PUBLIC_`)
- Calls `https://api.tavily.com/search` with `{ query, max_results }`
- Returns `{ output: string }` — numbered list of Title / URL / Content per result
- Returns `{ error: string }` with appropriate HTTP status on failure

**Output format:**
```
Search results for "...":

1. Title: ...
   URL: ...
   Content: ...

2. Title: ...
   ...
```

**Variable substitution:** `{{input}}` in the query field is replaced with the upstream context at execution time. Scoped to Lookup node only — AI/Router nodes are unaffected.

**Persistence:** `query` and `maxResults` are stored in `node.data` as part of the workflow graph JSONB. Dimensions persist via `node.style` like all other node types.

**Environment variable required:** `TAVILY_API_KEY=tvly-...` in `.env.local`

### External Tool Node Pattern

The Lookup node establishes the pattern for future external-tool nodes (HTTP Request, GitHub, Gmail, Database Query, etc.):

1. **Type definition** — Add `interface XxxNodeData` to `lib/types.ts`, extend `WorkflowNodeData` union
2. **Server route** — Create `app/api/xxx/route.ts`: auth-check first, read API key from env, call external service, return `{ output: string }` or `{ error: string }`
3. **Executor case** — Add `else if (node.type === "xxxNode")` in `executor.ts`, call the route via plain `fetch` (not streaming unless the service supports it), emit `node:output` + return output
4. **Validation** — Add required-field check in `validate.ts` if the node has a mandatory config field
5. **Component** — Create `components/canvas/nodes/XxxNode.tsx` following the AINode/LookupNode pattern: color scheme, handles, resize zone, execution state display
6. **Registration** — Add to `nodeTypes` in `WorkflowCanvas.tsx`, `createNodeDefaults`, `NODE_CARDS` in `NodeSidebar.tsx`
7. **Secrets** — All API keys stay server-side in `.env.local`; never use `NEXT_PUBLIC_` for external service credentials

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
