# WfloAI — CLAUDE.md

## Project Purpose

WfloAI is a visual AI workflow builder. Users create workflows by connecting nodes on a canvas, then run them to chain AI operations. The core loop: drag nodes onto the canvas → connect them → click Run → watch AI stream results through the graph.

---

## Implemented Features

- **Google OAuth** via Supabase Auth with cookie-based sessions
- **Invite-gated admission** — `profiles.approved` decides who gets in. Unapproved signed-in users land on the invite page (`/waitlist`) and can redeem an invite code (`redeem_invite_code`, security definer); the operator approves directly with SQL. Redemption attempts are limited per user (5 per 15 min, 20 per day) inside `redeem_invite_code` itself, recorded in `invite_redemption_attempts`. Enforced in `proxy.ts` for pages, inside each money-spending API route, and in the Inngest scheduled runner
- **Dashboard** — list all workflows with last-run timestamp, delete
- **Canvas editor** — React Flow canvas with drag-and-drop node creation
- **Seven node types** — Trigger, Input, File Input, AI, Router, Action, Lookup
- **Auto-save** — 700ms debounced PATCH to `/api/workflows/[id]` on every canvas change
- **Workflow execution** — server-side topological traversal via `POST /api/workflows/[id]/execute`; streams SSE events to the client in real time; run persisted to `workflow_runs` server-side after completion
- **Router node** — AI-evaluated conditional branching (true/false paths)
- **Structured node outputs** — AI nodes emit typed JSON per action type; Router node supports optional deterministic field-value branching before AI fallback
- **Execution log** — collapsible panel showing per-node status, output, duration
- **RLS-enforced multi-tenancy** — users see only their own data at the DB level
- **Node resizing** — drag bottom-right corner of any node; dimensions persist across saves/reloads
- **Run history** — right-side sidebar showing past workflow runs; History button in toolbar toggles it; runs saved automatically after every execution
- **Scheduled triggers** — Inngest-powered background execution; multiple named cron schedules per workflow stored in `workflow_schedules`; Workflow Settings sidebar (toolbar trigger pill) manages them; scheduled runs persist to `workflow_runs` like manual runs; per-schedule Run now button
- **Gmail integration** — connect Gmail once via OAuth in Settings (own Google OAuth client with PKCE, NOT the Supabase login provider); Gmail node with a single Action dropdown (Send Email / Create Draft / Reply to Email / Find Emails / Read Email) whose form changes per action; incremental authorization (`gmail.send` only at initial connect; the restricted scopes come via a separate "Enable email reading" flow that is off in V1); tokens AES-256-GCM encrypted at rest; server-execution-only. **V1 ships Send only** — Create Draft, Reply, Find and Read all need a Restricted scope and are gated off (see Gmail scope & launch strategy)
- **HTTP Request node** — power-user escape hatch: GET/POST/PUT/PATCH/DELETE with URL, query params, headers, body, and auth via the encrypted per-user credential store (Bearer / Basic / API-key header); DNS-rebinding-safe SSRF guard, manual redirect handling with credential stripping, streaming response cap, secret redaction; server-execution-only
- **Settings page** (`/settings`) — Gmail connection card (connect / capabilities / enable reading / disconnect) + API credentials card (add / replace-in-place / delete-with-usage-count; secrets write-only)
- **Account deletion and export** — Settings offers a typed-confirmation delete (`POST /api/account/delete`) that revokes the Gmail grant at Google, clears the caller `{user_id}/` storage prefix, then deletes the auth user and lets the cascade take the rest; it aborts at the first failure rather than stranding the grant. `GET /api/account/export` returns workflows, schedules and runs as JSON, never secrets
- **Integration safety rails** — idempotency ledger (`integration_action_executions`) with atomic claims prevents duplicate sends on retries; per-user quotas; audit log (`integration_audit_events`); unit tests via Vitest (`npm test`)
- **File Input node** — upload PDF/DOCX/TXT/MD/CSV into a workflow; browser uploads directly to the private `workflow-files` Supabase Storage bucket, then `POST /api/workflows/[id]/files` extracts text once (unpdf/mammoth/TextDecoder) and stores it in `workflow_files`; during execution the node outputs the extracted text like any other input; scheduled runs use the latest uploaded version; scanned/image PDFs are rejected with a clear error (no OCR in V1)

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Framework | Next.js (App Router) | 16.3.5 |
| UI runtime | React | 19.3 |
| Language | TypeScript | 5.7 |
| Canvas | React Flow | 11.11.4 |
| Backend | Supabase (Postgres + Auth) | `@supabase/ssr` 0.5 |
| AI | Anthropic SDK | 0.96 |
| Styling | Tailwind CSS | 3.4 |
| Icons | Lucide React | 0.511 |
| HTTP egress | undici (guarded Agent) + ipaddr.js | 8.x / 2.x |
| Tests | Vitest (`npm test`, unit tests in `tests/`) | 4.x |
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
- Use `lib/supabase/server.ts → createServerSupabaseClient()` in Server Components and API routes. It is **async** — Next 15 made `cookies()` async, so every call site must `await` it
- Use `lib/supabase.ts → createBrowserSupabaseClient()` in Client Components
- Never use the service role key in request-scoped code. The only permitted consumer of `lib/supabase/admin.ts → createAdminSupabaseClient()` is the Inngest execution path (`lib/inngest/functions.ts`), which runs with no user session. Admin-client code must re-verify ownership in application code (the workflow row's `user_id` must match the schedule owner carried in the event) and must always write rows with the schedule owner's `user_id` so RLS-scoped reads stay correct

### Execution engine

Two executor files live in `lib/execution/`:

**`serverExecutor.ts` (primary)** — server-only; uses Anthropic SDK directly; invoked by `app/api/workflows/[id]/execute/route.ts`. That route owns the full graph traversal, SSE streaming, and `workflow_runs` persistence.

**`executor.ts` (browser-side, legacy)** — browser-safe, no Node.js APIs; called internally by `/api/execute` for single-step AI calls. Still exists; not the primary run path.

- `topologicalSort.ts` is shared between both executors
- `types.ts` defines all execution events — extend the union there; never use raw string event types
- Neither executor may import React or Next.js
- New node types must be handled in **both** `executor.ts` and `serverExecutor.ts` before the `throw new Error('Unsupported node type')` fallback in each

### API routes
- All routes in `app/api/` must call `supabase.auth.getUser()` before any operation and return 401 if unauthenticated — exception: `app/api/inngest/route.ts` is Inngest's webhook endpoint; its auth is request-signature verification via `INNGEST_SIGNING_KEY` in production (the local dev server runs unsigned)
- Validate all incoming payloads — use guard functions (`isValidGraph`, `isValidNodeResults`) before writing to DB
- `/api/execute` streams via `ReadableStream` with `text/plain` content-type — do not change this without updating `requestAIText()` in `executor.ts`
- `/api/workflows/[id]/execute` is the primary run endpoint — streams SSE (`text/event-stream`), executes the full graph server-side via `serverExecutor.ts`, persists `workflow_runs`

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
type AINodeData       = { label: string; action: AIActionType; prompt: string; outputFields?: string[] }
type RouterNodeData   = { label: string; prompt: string; conditionField?: string; conditionValue?: string }
type ActionNodeData   = { label: string; action: "Save Output" | "Log Result" | "Display" }
type LookupNodeData   = { label: string; query: string; maxResults: number }
type FileInputNodeData = {
  label: string;
  fileId?: string;       // references workflow_files.id
  filename?: string;
  fileType?: string;     // mime type
  fileSize?: number;     // bytes
  pageCount?: number;    // PDFs only
  textLength?: number;   // extracted character count
  resolvedText?: string; // transient — injected server-side pre-execution by resolveFileInputs(); canvas code must never read or write it
}
```

### `execution_logs` (legacy table — retired)
The `public.execution_logs` table still exists in the DB (no destructive migration) but nothing reads or writes it anymore. `workflow_runs` is the canonical run store. The old `/api/workflows/[id]/logs` route and `ExecutionLogRow` type were removed.

### `WorkflowRun` (DB table: `public.workflow_runs`)
```ts
interface WorkflowRun {
  id: string;            // uuid, PK
  workflow_id: string;   // uuid, FK → workflows (cascade delete)
  user_id: string;       // uuid, FK → auth.users (cascade delete)
  status: "success" | "error";
  final_output: string | null;   // output of the last completed node
  node_outputs: Array<{          // full per-node results, mirrors ExecutionLogEntry[]
    nodeId: string;
    status: string;
    output: string;
    durationMs?: number;
  }> | null;
  error: string | null;          // output of the first errored node, if any
  trigger: "manual" | "scheduled" | null;  // how the run started; null on legacy rows
  started_at: string | null;     // ISO UTC, captured when execution begins
  completed_at: string | null;   // ISO UTC, captured when workflow:done fires
  created_at: string;            // ISO UTC, default now()
}
```

### `WorkflowSchedule` (DB table: `public.workflow_schedules`)
```ts
interface WorkflowSchedule {
  id: string;                          // uuid, PK
  workflow_id: string;                 // uuid, FK → workflows (cascade delete); many schedules per workflow
  user_id: string;                     // uuid, FK → auth.users (cascade delete)
  name: string;                        // user-facing label, e.g. "Morning Post"
  enabled: boolean;
  cron_expression: string;             // 5-field cron, canonical representation
  timezone: string;                    // IANA name, e.g. "America/Los_Angeles"
  input_values: Record<string, string>; // optional overrides for Input node defaultValues, keyed by Input key
  last_run_at: string | null;          // ISO UTC, set when the poller claims the schedule
  next_run_at: string | null;          // ISO UTC; null when disabled
  created_at: string;
  updated_at: string;                  // auto-updated by DB trigger
}
```

### `WorkflowFile` (DB table: `public.workflow_files`)
```ts
interface WorkflowFile {
  id: string;             // uuid, PK — equals the fileId stored in FileInputNodeData
  workflow_id: string;    // uuid, FK → workflows (cascade delete)
  user_id: string;        // uuid, FK → auth.users (cascade delete)
  filename: string;
  mime_type: string;
  size_bytes: number;
  page_count: number | null;   // PDFs only
  storage_path: string;   // {user_id}/{workflow_id}/{fileId} in the workflow-files bucket
  extracted_text: string; // capped at MAX_EXTRACTED_CHARS (200k)
  created_at: string;     // ISO UTC
}
```

Raw bytes live in the private `workflow-files` Storage bucket at `storage_path`; storage RLS policies allow access only when the first path folder equals `auth.uid()`. Files are immutable — Replace uploads a new file and deletes the old one. Deleting a workflow cascades the rows but leaves storage objects orphaned (private, unreferenced; cleanup sweep is a future task).

Future trigger types (webhook, gmail, slack, calendar) get their own tables (`workflow_webhooks`, …) — each needs different metadata; there is no generic trigger table. Future: `workflow_versions` — schedules currently execute the latest saved graph, so an edit silently changes automation behavior; pinning schedules to a graph version would fix that.

### RouterNode edge convention
Router nodes have exactly two output handles: `"true"` and `"false"`. The executor filters outgoing edges by matching `edge.sourceHandle` to the AI's response string. Any future conditional node type must follow this same handle-naming convention.

---

## Coding Conventions

- **No comments** unless the reason is non-obvious. Never narrate what the code does.
- **No error handling for impossible states.** Trust TypeScript types and RLS.
- **No premature abstractions.** Three similar lines is better than a premature helper.
- **No `any`.** Use proper types from `lib/types.ts`; extend that file when needed.
- **Tailwind only** for styling. No CSS modules, no inline `style` props.
- **Node type strings are literals:** `"triggerNode"`, `"aiNode"`, `"routerNode"`, `"actionNode"`, `"lookupNode"`, `"inputNode"`, `"fileInputNode"`. These must match across React Flow node registration, the executor switch, and the DB-stored graph.
- **Execution events** are typed in `lib/execution/types.ts` — extend the union there; never use raw string event types.
- Import paths use the `@/` alias (mapped to project root).
- Never put secrets in `NEXT_PUBLIC_` env vars. Client-accessible vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` only.

---

## Constraints for Future Development

### Adding a new node type
1. Add its data interface to `lib/types.ts` and include it in the `WorkflowNodeData` union
2. Create the React Flow node component in `components/canvas/nodes/`
3. Register it in `nodeTypes` in `WorkflowCanvas.tsx`
4. Handle it in **both** `executor.ts` and `serverExecutor.ts` before the `throw new Error('Unsupported node type')` fallback in each
5. Add it to the draggable library in `NodeSidebar.tsx` — every `NODE_CARDS` entry needs a `category` (`"Sources" | "AI" | "Logic" | "Actions"`); the sidebar renders cards grouped by these categories. Future source-type nodes (HTTP, Gmail, Drive, Calendar, Webhooks) belong in `Sources`
6. Update `isValidConnection` in `WorkflowCanvas.tsx` if it needs connection constraints

### Node visual design

All node components share a consistent visual template. Follow this pattern when creating a new node type.

**Root container:**
```jsx
className={`relative flex h-full flex-col min-w-[...px] overflow-hidden rounded-xl border bg-white shadow-card ${
  isComplete ? "border-emerald-400" : isError ? "border-rose-400" : "border-{color}-300"
}`}
```
- 1px border on all sides
- Idle: `border-{color}-300` — soft accent tint
- Complete: `border-emerald-400`; Error: `border-rose-400` (fully opaque, no alpha)
- `shadow-card` is defined in `tailwind.config.ts` (`0 1px 2px rgba(16,16,20,0.04)`); floating panels use `shadow-panel`

**Header (always white background):**
```jsx
<div className={`flex flex-shrink-0 items-center gap-3 border-b border-gray-100 px-4 py-2.5 ${isRunning ? "animate-pulse" : ""}`}>
  <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
    isError ? "bg-rose-100" : isComplete ? "bg-emerald-100" : "bg-{color}-50"
  }`}>
    {isRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin text-{color}-600" />
    : isComplete ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
    : isError ? <AlertTriangle className="h-3.5 w-3.5 text-rose-600" />
    : <NodeIcon className="h-3.5 w-3.5 text-{color}-600" />}
  </div>
  <div>
    <p className="text-sm font-semibold text-gray-900">Node Title</p>
    <p className={`text-xs ${isError ? "text-rose-600" : "text-gray-500"}`}>{data.label}</p>
  </div>
</div>
```

**Handles:** `!h-2.5 !w-2.5 !border-2 !border-white !bg-{color}-500` (RouterNode true/false output handles use emerald/rose fills). Error text inside nodes is always `text-rose-600`.

**Accent color per node type:**

| Node type | `{color}` | Icon |
|---|---|---|
| `triggerNode` | `emerald` | `Zap` |
| `aiNode` | `violet` | `BrainCircuit` |
| `routerNode` | `amber` | `GitBranch` |
| `actionNode` | `blue` | `TerminalSquare` |
| `lookupNode` | `cyan` | `Search` |
| `inputNode` | `fuchsia` | `Inbox` |
| `fileInputNode` | `orange` | `FileText` |

**Form inputs inside the node:**
- Background: `bg-gray-50`, border: `border-gray-200`, radius: `rounded-lg`
- Focus: `focus:border-{color}-400 focus:ring-2 focus:ring-{color}-500/25`
- Text: `text-gray-900`, placeholder: `placeholder:text-gray-400`

**Section labels (used app-wide for eyebrows/labels):**
```jsx
<p className="text-[11px] font-medium uppercase tracking-[0.08em] text-gray-400">Label</p>
```

**Global typography:** Inter loaded via `next/font/google` in `app/layout.tsx` (`--font-sans`, wired to Tailwind `fontFamily.sans`). Page titles `text-xl font-semibold tracking-tight`; panel titles `text-sm font-semibold`; radius scale: shells `rounded-2xl`, cards/nodes `rounded-xl`, inputs `rounded-lg`, pills `rounded-full`.

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
- Auth-check first via `(await createServerSupabaseClient()).auth.getUser()`
- Dynamic segments arrive as a Promise: type the context as `params: Promise<{ id: string }>` and `await` it before use (Next 15+)
- Segment config exports (`maxDuration`, `dynamic`, `revalidate`) must be literals — Next 16 rejects an imported constant as not statically analyzable
- Return consistent error shapes: `{ error: string }` with appropriate HTTP status
- Streaming routes must return `ReadableStream` with `text/plain`

### Database migrations
- New files go in `supabase/migrations/` with prefix `YYYYMMDDNNNN_description.sql`
- All new tables must have RLS enabled with per-user `auth.uid() = user_id` policies
- Any change to the `graph` JSONB shape requires both a migration and a `lib/types.ts` update
- All user-data tables need `user_id uuid references auth.users(id) on delete cascade`

### Structured node outputs

**AI node schema system:**
`getActionSchema(action, outputFields?)` in both executors maps each `AIActionType` to a fixed JSON shape:

| Action    | Output shape |
|-----------|-------------|
| Summarize | `{ summary: string, keyPoints: string[] }` |
| Rewrite   | `{ rewrittenContent: string }` |
| Classify  | `{ category: string, confidence: number, reasoning: string }` |
| Extract   | `{ [field]: string }` — one key per entry in `outputFields` |
| Generate  | `{ content: string }` |

The schema is appended to the AI prompt as a hard "respond with ONLY valid JSON" constraint. After streaming, `extractJson()` strips any markdown code fences, then `JSON.parse()` validates the result. Failure throws with a descriptive error surfaced as a node error in the UI.

**Context passing (`buildParentContext()`):**
Each upstream output is inspected. If it parses as a JSON object it is prefixed:
`"Structured output:\n" + JSON.stringify(parsed, null, 2)`
Plain-text outputs (Trigger, Lookup) pass through as-is. Downstream AI nodes see the prefix as a signal that the input is typed structured data.

**`NodeOutputDisplay` (`components/canvas/NodeOutputDisplay.tsx`):**
- `cleanOutput(raw)` — strips `"Structured output:\n"` prefix before display or parsing
- `getOutputPreview(raw, maxLength)` — first string field value, truncated; used in row summaries
- `NodeOutputDisplay({ output })` — renders JSON as labeled field sections (arrays → bullet lists); falls back to `whitespace-pre-wrap` for plain text
- Used in: `ExecutionLog.tsx`, `RunHistorySidebar.tsx`, `ActionNode.tsx`

**Router node deterministic routing:**
If `conditionField` and `conditionValue` are set on a RouterNode, the executor checks `String(parsed[conditionField]) === conditionValue` against the upstream JSON before calling AI. Match → `"true"` handle; no match → `"false"` handle. Falls through to AI routing if context is not JSON or the field is absent.

### Run history architecture

**How runs are saved (server-side only):**
1. `POST /api/workflows/[id]/execute` accumulates node results while streaming SSE, then inserts the `workflow_runs` row (with `trigger: "manual"`) before closing the stream
2. Scheduled runs insert their row (with `trigger: "scheduled"`) in the `persist-run` step of `lib/inngest/functions.ts`
3. The client never writes runs — `useExecution.ts` fires the optional `onRunSaved` callback after the SSE stream drains (the row is already inserted by then)
4. `WorkflowCanvasShell` passes `() => setRunRefreshTrigger(n => n + 1)` as `onRunSaved`
5. The dashboard's "Last run" time + status dot read the latest `workflow_runs` row per workflow

**How the sidebar loads runs:**
- `RunHistorySidebar` (`components/canvas/RunHistorySidebar.tsx`) has a `useEffect` keyed on `[open, refreshTrigger, workflowId]`
- When `open=true` or `refreshTrigger` increments, it fetches `GET /api/workflows/[id]/runs`
- Runs are displayed newest-first; clicking a row expands the full output

**How runs are deleted:**
- Each run row has a hover-reveal delete button
- Clicking it calls `DELETE /api/workflows/[id]/runs/[runId]` and removes the row from local state
- RLS enforces user ownership at the DB level; the route also checks explicitly

**History button:**
- Located in `CanvasToolbar` between Run and Fullscreen buttons
- Uses `History` icon from lucide-react
- Highlights violet when the sidebar is open
- When sidebar is open, `ExecutionLog` shifts left by 320px (`right-[324px]`) and narrows accordingly

### Scheduled triggers (Inngest)

Triggers are **workflow-level metadata**, not canvas nodes. Manual is not a trigger object — it is just the Run button; a workflow with zero enabled schedules shows "No triggers" in the toolbar pill.

**Two execution paths share the same executor:**
```
Manual:    Browser → POST /api/workflows/[id]/execute (SSE) → executeWorkflow → insert workflow_runs
Scheduled: Inngest cron poller → event fan-out → runner → runWorkflowToCompletion (wraps executeWorkflow, no SSE) → insert workflow_runs
```

**Files:**
- `lib/inngest/client.ts` — Inngest client, typed `workflow/schedule.due` event
- `lib/inngest/functions.ts` — `checkDueSchedules` (cron `* * * * *`, retries 0) + `runScheduledWorkflow` (event-triggered, retries 1, per-workflow concurrency 1)
- `app/api/inngest/route.ts` — `serve()` endpoint, `maxDuration = 300`
- `lib/execution/runToCompletion.ts` — accumulates execution events into a `CollectedRun` without SSE; mirrors the accumulation in the execute route (kept duplicated so the SSE route stays untouched)
- `lib/schedule/cron.ts` — `computeNextRunAt` (cron-parser, IANA tz), preset↔cron mapping, `describeCron`
- `lib/supabase/admin.ts` — service-role client; Inngest path only
- `app/api/workflows/[id]/schedules` — GET list / POST create; `[scheduleId]` PATCH/DELETE; `[scheduleId]/run` POST emits the same `workflow/schedule.due` event (Run now)

**Poller mechanics (do not weaken):**
- Query: `enabled = true AND next_run_at <= now()`, served by the partial index `workflow_schedules_due_idx`
- Claim: compare-and-swap `UPDATE … WHERE id = ? AND next_run_at = <observed> AND enabled` — exactly one winner per occurrence; `next_run_at` is advanced from `now` at claim time, so overdue schedules fire once (no backfill)
- Fan-out: one `workflow/schedule.due` event per claimed schedule; the runner serializes per workflow via `concurrency { key: workflowId, limit: 1 }`
- Node-level failures never throw out of `runWorkflowToCompletion` — they become a `status: "error"` run row; Inngest retries only fire on infra throws, and the execute/persist step split means retries never re-spend AI tokens
- Validation failures persist an error run (visible in Run History) and do not auto-disable the schedule
- A run skipped for ownership, a deleted schedule, or an unapproved owner returns before `persist-run` — deliberately, since there is nothing to record — but that also means **no run row, no failure count and no report**. An owner whose approval is revoked therefore has every schedule stop silently. Revoking approval is not a casual action

**Capacity, not a quota.** The poller takes `.limit(50)` due schedules per minute. That is a **throughput ceiling on the poller**, never a per-user allowance: `MAX_SCHEDULES_PER_USER` is 20 and `MIN_INTERVAL_MINUTES` is 15, so three users at cap can fill a single minute. Nothing is lost when it binds — unclaimed schedules stay due and are picked up on a later tick, because `next_run_at` only advances on a successful claim — but they run **late**, and lateness grows with the backlog. Watch claimed-per-tick against 50 in production; if it is regularly at the ceiling, that is a capacity signal, not a reason to raise per-user caps. Do not read `.limit(50)` as a quota in either direction


**input_values:** applied in the runner before validation — Input nodes whose `key` appears in `schedule.input_values` get their `defaultValue` replaced (immutably). No UI edits this yet; it defaults to `{}`.

**Schedule UI:** `components/canvas/WorkflowSettingsSidebar.tsx` (Workflow Settings → Schedules section; future trigger types become sibling sections). Opened via the toolbar trigger pill in `CanvasToolbar` (shows "Next run · …" when a schedule is enabled). Settings and History sidebars share the right-edge slot — opening one closes the other.

**Env vars:** `SUPABASE_SERVICE_ROLE_KEY` (required, server-only), `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY` (production only — the local dev server `npx inngest-cli dev` runs unsigned and auto-discovers `/api/inngest`).

### File Input node

**Upload flow (direct-to-Storage — no multipart through API routes):**
1. `FileInputNode.tsx` pre-checks extension + per-type size limit (from `lib/files/constants.ts`), generates `fileId = crypto.randomUUID()`
2. Browser uploads raw bytes via `createBrowserSupabaseClient().storage.from("workflow-files").upload("{userId}/{workflowId}/{fileId}", file)` — storage RLS authorizes the write
3. Client POSTs `{ fileId, filename }` to `/api/workflows/[id]/files`; the server verifies workflow ownership, constructs the storage path itself (never trusts a client-supplied path), downloads the object, re-checks size, extracts text (`lib/extraction/extractText.ts`), and inserts the `workflow_files` row. Any failure removes the storage object and persists nothing
4. Node stores `{ fileId, filename, fileType, fileSize, pageCount, textLength }` in `node.data`; persistence rides the normal 700ms auto-save

**Size limits** (product-level, defined ONLY in `lib/files/constants.ts`): 20 MB for PDF/DOCX, 5 MB for TXT/MD/CSV, 200k-char extraction cap. Client checks are advisory; the route re-verifies from actual byte length.

**Scanned-PDF guard:** after PDF extraction, trimmed text shorter than `max(40, 10 × pageCount)` chars → 422 "scanned or image-based" error, nothing persisted. No OCR in V1.

**Execution (pre-resolve pattern):** executors have no DB access, so both run paths resolve file text before calling `executeWorkflow`:
- Manual: `execute/route.ts` calls `resolveFileInputs(nodes, supabase, user.id)` (user-scoped client, RLS applies)
- Scheduled: `lib/inngest/functions.ts` calls `resolveFileInputs(nodes, adminClient, event.data.userId)` — the `user_id` filter inside the query is the ownership guard, since the admin client bypasses RLS and the graph JSONB is user-writable
`resolveFileInputs` injects `extracted_text` as transient `data.resolvedText`; the executor case outputs it directly. A missing row (deleted file, stale `fileId`) surfaces as a descriptive node error, never a crash.

**Scheduled runs use the latest uploaded version** of the file (the graph stores only `fileId`, and schedules execute the latest saved graph). The node UI states this explicitly.

### Gmail integration & HTTP Request node

**Server-execution-only.** Both nodes run ONLY in `serverExecutor.ts` (manual runs via `POST /api/workflows/[id]/execute`, scheduled via Inngest). `executor.ts` (browser) throws "This node runs on the server" for them. There are NO `/api/gmail` or `/api/http-request` routes. Consequence: credentials, Gmail message/thread IDs, and idempotency state never reach the browser.

**Execution context.** `executeWorkflow` takes an optional 4th arg `IntegrationContext` (`lib/integrations/types.ts`): `{ supabase, userId, workflowId, runId, actionsUsed }`. Manual path: user-scoped client + a run UUID generated *before* execution (reused as the `workflow_runs` PK). Inngest path: admin client + `event.data.userId` + `deriveRunId(event.id)` — deterministic, so function retries reuse the same idempotency keys.

**Secret storage.** `lib/crypto.ts` — AES-256-GCM, versioned envelope `v1:<iv>:<ciphertext>:<authTag>`, key from `INTEGRATION_TOKEN_KEY` (32-byte base64; **must be backed up** — regenerating it orphans every stored secret). Encrypts Gmail refresh AND access tokens, credential payloads, and the OAuth state cookie. Secrets are write-only: no API returns decrypted values (api_key `headerName` is the only decrypted field exposed — it isn't secret).

**Repository layer.** `lib/integrations/repo.ts` is the ONLY sanctioned access path to `gmail_connections` / `user_credentials`. Every function takes a non-optional `userId` and filters on it — this is the ownership guard on the admin-client path where RLS is bypassed.

**Idempotency (`lib/integrations/idempotency.ts`).** Gmail Send/Draft/Reply and HTTP POST/PUT/PATCH/DELETE claim a row in `integration_action_executions` (key `runId:nodeId`, unique) *before* the external call: upsert-ignoreDuplicates insert (atomic winner), `succeeded` rows replay stored redacted `result_output` without re-executing, `pending`/`unknown` block with "may have already run", `failed` reclaims via conditional UPDATE (single winner). Ambiguous timeouts mark `unknown` and are never auto-retried. Read-only actions (GET, Find, Read) skip the ledger.

**Redaction (`lib/integrations/redact.ts`).** Applied inside `lib/http/` and `lib/gmail/` before any string becomes node output, node error, or ledger content: value-based (every actual credential value used in the execution → `[REDACTED]`) plus recursive key-based redaction for JSON responses. Never log Google token responses.

**HTTP network security (`lib/http/`).** undici `fetch` through a guarded `Agent` whose DNS `lookup` rejects any resolved address that isn't public unicast (loopback/private/link-local/CGNAT/multicast/reserved/metadata; IPv4-mapped IPv6 unmapped and re-checked) — connect-time validation closes the DNS-rebinding TOCTOU gap. Manual redirects (max 3), each destination re-validated; **cross-origin hops strip all credential-derived headers**; 301/302/303 follow as GET without body; HTTPS→HTTP downgrade with credentials/body rejected. Blocked user headers: host, content-length, connection, transfer-encoding, upgrade, proxy-authorization, cookie. Limits in `lib/http/constants.ts` (URL 2048, 32 headers, 4KB header value, 256KB body, 500KB streaming response cap, 10s connect / 30s total). Binary responses return `{status:"Binary response received", contentType, sizeBytes}` — never raw bytes.

**Gmail module (`lib/gmail/`).** `scopes.ts` is the single scope⇄action map. `client.ts` handles token lifecycle: encrypted cache, refresh with optimistic CAS on `access_token_expires_at` (concurrent refreshes → one Google call), `invalid_grant` → `status='requires_reconnect'` (fail fast, never hammer refresh). `mime.ts` is header-injection safe: CR/LF rejected in all header values, recipients parsed with a narrow quoted-string-aware parser (display names dropped), RFC 2047 subject encoding, plain-text only in V1. `infer.ts`: Reply/Read resolve their target email from **typed in-memory metadata of direct parents only** (`metadataByNodeId` in serverExecutor) — never by scanning output text; ambiguity (0 or >1 Gmail parents) fails before any external action. **Reply requires a Read Email node as direct parent** (statically enforced in `validate.ts`); canonical flow: Find → Read → AI Draft → Reply. Find fetches per-message metadata with bounded concurrency (5).

**Quotas (`lib/integrations/limits.ts`).** Single source of limits: 60 HTTP mutations/min; 10 Gmail sends/min and 200/day; 20 AI calls/min and 200/day; 10 Lookup searches/min and 100/day; 50 external actions/run; 20 AI nodes/run (enforced in `lib/execution/validate.ts`). Every window is **ledger-derived** — counted from `integration_action_executions`, so it holds across serverless instances.

AI and Lookup consume theirs **atomically** through `consume_action_quota` (migration `202609150002`), which counts and inserts a `pending` row inside one advisory-locked statement, so an in-flight call already counts; `settleMeteredAction` then settles it to `succeeded`/`failed` with measured units. Gmail and HTTP still use the pre-existing check-then-act windows, whose residual race is bounded and documented in `release-readiness/03-ai-lookup-quotas.md`.

**There is no concurrency limiter.** `MAX_CONCURRENT_REQUESTS` was an in-memory `Map` and therefore a no-op on serverless; Task 03 removed it rather than leave something that reads like a working control. What replaces it is the set of durable protections above plus `maxDuration` and the node-count cap (`lib/execution/constants.ts`) and the schedule floor and caps (`lib/schedule/constants.ts`). Do not reintroduce an in-process gauge.

Audit events (`lib/integrations/audit.ts`) are best-effort — an audit failure must never fail a successful send.

**Gmail scope & launch strategy.** Google's classification — always confirm it in the Cloud Console, never from prose:

| Scope | Classification | In V1? |
|---|---|---|
| `gmail.send` | **Sensitive** | Yes — the only scope V1 requests |
| `gmail.compose` | **Restricted** | No — deferred with D1 |
| `gmail.readonly` | **Restricted** | No — deferred with D1 |

Initial connect requests **`gmail.send` only**. Requesting *any* Restricted scope at connect time puts the entire Gmail integration behind a CASA security assessment — not just the actions that use it — so `gmail.compose` was removed from the initial tier (A15). The "Enable email reading" flow adds the restricted scopes with `include_granted_scopes=true` and belongs to the deferred D1 program; `gmail_connections.scopes` stores what Google actually granted.

Feature flag `GMAIL_READ_ACTIONS_ENABLED=false` hides **every restricted-scope action — Create Draft, Reply, Find and Read** — from both the node dropdown and execution, so Send can ship while restricted-scope verification is pending. `lib/gmail/scopes.ts` holds the two predicates: `isRestrictedAction()` (what the flag gates) and `needsReadScope()` (the narrower set that "Enable email reading" can actually unblock — Create Draft is not one of them, since it needs `compose`).

**Pre-launch checklist for V1 (sensitive-scope path only):** consent-screen published, verified domain, privacy policy, terms, data-use disclosure, scope justification, `gmail.send` sensitive-scope verification submitted. Restricted-scope verification and the security assessment are **not** V1 launch dependencies — that is the deferred D1 program.

**Public-run safety invariant (future).** Public/unauthenticated workflow runs must NOT execute Gmail Send/Reply/Create Draft or mutating HTTP actions by default. When public links ship: explicit owner opt-in, per-link rate limits, execution caps, owner warnings, optional pre-execution approval. Public pages must never expose credential names, connected Gmail addresses, secret-backed headers, or internal metadata.

**Retention (future task).** `integration_action_executions` and `integration_audit_events` grow unbounded; add a periodic Inngest cleanup (audit >90 days; ledger >30 days past completion, never `pending`/`unknown` younger than 7 days).

**New tables** (all RLS per-user, migrations `202607190001–4`): `gmail_connections` (one per user; encrypted tokens, granted scopes, `status active|requires_reconnect`), `user_credentials` (`type bearer|basic|api_key`, `secret_encrypted`), `integration_action_executions` (idempotency ledger + quota source), `integration_audit_events` (no secret values; `result succeeded|failed|blocked|unknown`).

**Env vars:** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `INTEGRATION_TOKEN_KEY`, `GMAIL_READ_ACTIONS_ENABLED` (all server-only).

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

**Variable substitution:** `{{previousOutput}}` resolves to the upstream context in AI, Router, and Lookup fields; `{{key}}` resolves to Input node values. When a prompt references `{{previousOutput}}`, the automatic "Context from previous step" block is skipped to avoid duplicating tokens. Legacy `{{input}}` is still accepted at runtime in Lookup queries only; the canvas UI auto-converts it to `{{previousOutput}}` on edit, and validation flags it as deprecated in AI/Router prompts. Variable hints are minimal helper/placeholder text on the AI/Router/Lookup fields; the `{{key}}` tag itself is displayed only on Input nodes (where variables are declared).

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
| RLS policies on `workflows`, `execution_logs`, `workflow_runs`, and `workflow_schedules` | Only DB-level access control — weakening them exposes all users' data |
| `workflow_runs` INSERT policy subquery on `workflows` | Prevents users from inserting runs for workflows they don't own, even if they guess a workflow UUID |
| `/api/execute` streams `text/plain` chunks | `requestAIText()` reads raw chunks; changing format breaks AI node streaming |
| `updateSession()` in `proxy.ts` on every request | Without it, sessions don't refresh and users get logged out unexpectedly. Next 16 renamed the `middleware.ts` convention to `proxy.ts`; the exported function is `proxy`, and it is still the auth gate |
| The auth allow-list lives in `lib/security/publicPaths.ts`, and `requiresAuth()` gates an unrecognised path by default | `/` , `/privacy` and `/terms` are public and everything else is not; a deny-list left `/settings` ungated once already (A4), and the default-deny is what stops a new route inheriting that |
| `profiles` has no UPDATE policy, and `approved` is written only by `redeem_invite_code` or the service role | `approved` is the admission gate; a user who could update their own row could approve themselves |
| The invite attempt limit lives inside `redeem_invite_code`, and `invite_redemption_attempts` has no client write policy | The function is granted to `authenticated`, so a signed-in user can call it directly over PostgREST; a route-level limiter would be skipped, and a writable attempt table could be backdated or emptied to reset the window |
| Every money-spending route checks `requireApprovedUser` itself, and the Inngest runner checks `isApprovedUser` | The proxy deliberately does not gate `/api/`, and a schedule spends with nobody signed in — a gate that only covers pages is not a cost control |
| `workflow_schedules.unattended_send_authorized_at` is the operative unattended-send consent, not the audit event | Retention deletes `integration_audit_events` after 90 days; a schedule must not become authorised or unauthorised as a side effect of a sweep. The audit row stays as historical evidence of who confirmed and when |
| A graph save disables any enabled schedule on that workflow that lacks consent once the graph can send | Schedules execute the latest saved graph, so adding a Gmail Send step would otherwise start unattended sending on an authorisation nobody gave. `runScheduledWorkflow` re-checks before any mail leaves, and records the refusal as a visible error run |
| Workflow deletion goes through `DELETE /api/workflows/[id]`, never a direct client delete | The row cascade does not remove Storage objects. The route sweeps `{user_id}/{workflow_id}/` **before** deleting the row, so a storage failure deletes nothing rather than orphaning bytes the privacy policy says are gone |
| Invite seats are consumed permanently, including when the redeeming account is deleted | An invite grants one admission, not a transferable seat. A returning deleted user gets a new auth id, a fresh unapproved profile, and needs admission again |
| `createServerSupabaseClient()` in API routes (not browser client) | Browser client in server context breaks cookie-based auth |
| 700ms debounce on auto-save in `WorkflowCanvasShell` | Without it, every React Flow state change fires a PATCH — floods the DB |
| Cycle detection in `topologicalSort.ts` | Without it, cyclic graphs hang the browser tab indefinitely |
| `extractJson()` strips fences before `JSON.parse()` in both executors | Claude occasionally wraps JSON in code fences despite instructions; without stripping, all AI nodes fail JSON validation |
| `"Structured output:\n"` prefix written by `buildParentContext()` | `cleanOutput()` in `NodeOutputDisplay` matches this exact string — changing the prefix breaks display in the canvas, execution log, and run history sidebar |
| CAS claim in `checkDueSchedules` (`UPDATE … WHERE next_run_at = <observed>`) | Only duplicate-run protection — replacing it with a plain UPDATE lets concurrent polls fire the same occurrence twice |
| `createAdminSupabaseClient()` used only in `lib/inngest/functions.ts` | Service role bypasses RLS; any request-scoped use would let a forged request read/write other users' data |
| `runScheduledWorkflow` split into execute + persist `step.run`s | Inngest retries replay memoized steps — merging them makes a persistence retry re-run the whole AI chain and double-spend tokens |
| `resolvedText` on fileInputNode injected server-side pre-execution only | Canvas code must never read/write it; if it leaked into the saved graph, stale file text would silently override the current upload |
| `user_id` filter in `resolveFileInputs` on the Inngest path | The admin client bypasses RLS and graph JSONB is user-writable — removing the filter lets a forged `fileId` read another user's file text |
| File size limits live only in `lib/files/constants.ts` | Client and server both import them; a second definition lets the checks drift apart |
| Server constructs the storage path in `/api/workflows/[id]/files` | Accepting a client-supplied path would allow reads/writes outside the user's `{user_id}/` prefix |
| Gmail/HTTP nodes execute only in `serverExecutor.ts` | Moving them client-side would expose credentials, Gmail IDs, and break idempotency |
| `lib/integrations/repo.ts` is the only access path to `gmail_connections` / `user_credentials`, with mandatory `userId` filters | The admin client bypasses RLS; the explicit filter is the only cross-user guard on the Inngest path |
| Idempotency claim before every Gmail send/draft/reply and mutating HTTP call | Removing it lets Inngest retries or concurrent runs send the same email twice |
| Redaction runs before any integration output/error is emitted or stored | Skipping it leaks bearer tokens echoed by APIs into run history and the ledger |
| Connect-time DNS guard in `lib/http/ssrfGuard.ts` + manual redirect re-validation | String-only hostname checks are bypassable via DNS rebinding or redirects to internal IPs |
| CR/LF rejection + narrow address parsing in `lib/gmail/mime.ts` | Interpolated workflow input reaches MIME headers; without it users can inject Bcc/arbitrary headers |
| `INTEGRATION_TOKEN_KEY` versioned envelope (`v1:`) and key backup | Rotating the key without the version path orphans every stored refresh token and credential |
| Gmail message/thread IDs stay in `NodeExecutionResult.metadata` (server memory + ledger only) | Putting them in output strings exposes them in UI, AI prompts, run history, and future public pages |
| Public runs never execute destructive integration actions by default (when public links ship) | Anonymous visitors would send email / fire authenticated HTTP with the owner's credentials |
