# Objective

Get off an end-of-life framework. Next.js 14 reached EOL on 26 October 2025 and 14.2.35 was its final patch. 2026 advisories affecting 13.x/14.x App Router (CVE-2026-23869, CVE-2026-23870, CVE-2026-23864) will **not** be patched for 14.x.

This matters more here than in a typical app: `middleware.ts` *is* the authentication gate, and the unpatched advisory lineage includes middleware bypass and cache poisoning. That combination is a direct compromise path, not a theoretical one.

**This is the longest pole in the plan.** Start it early and let it run alongside the documentation-heavy tasks. It should finish while policies are being drafted, not block the Google submission.

# Audit Items

**A9** (Next.js 14.2.35 is end-of-life)

# Current State

`next` is pinned at **14.2.35** (App Router). Supporting stack: TypeScript 5.7, React Flow 11.11.4, `@supabase/ssr` 0.5, Tailwind 3.4, Node 22.x.

The audit's estimate is **2â4 days including regression testing**, driven by two breaking-change surfaces:

1. **Async `headers()` / `cookies()`.** This touches **every** Supabase server-client call site â `lib/supabase/server.ts` and every Server Component and API route that uses it. Mechanical but wide.
2. **React 19.** Ecosystem compatibility, particularly React Flow.

Target: 15.x (supported through October 2026) or 16.x.

# Required Changes

- [x] Upgrade `next` and `react` / `react-dom` to the chosen target. Decide 15.x vs 16.x deliberately â 15.x is the lower-risk hop with a defined support window; 16.x buys more runway at more migration cost.
- [ ] Run the official codemod where available, then review every change it makes rather than trusting it wholesale.
- [x] Convert all `headers()` / `cookies()` call sites to the async form, starting from `lib/supabase/server.ts` and following the call graph outward.
- [x] Verify `@supabase/ssr` is at a version compatible with the target Next.js. If it is not, that is a blocker to resolve before proceeding, not a thing to work around.
- [ ] Verify React Flow 11.11.4 works under React 19. If it does not, the upgrade path may require a React Flow major â see Stop Conditions.
- [ ] Re-verify `middleware.ts` behaves identically after upgrade. Middleware is the auth gate; a subtle behavior change here is the single most dangerous outcome of this task.
- [x] Re-verify the SSE streaming path in `app/api/workflows/[id]/execute/route.ts` and the `text/plain` streaming contract in `app/api/execute/route.ts`. CLAUDE.md lists both as invariants â `requestAIText()` in `lib/execution/executor.ts` reads raw chunks and will break silently if the response shape changes.
- [x] Re-verify `app/api/inngest/route.ts` including its `maxDuration = 300`.
- [x] Update the `next` version reference wherever it is documented (CLAUDE.md tech-stack table; README â though README is task 12's problem, do not leave it asserting 14.2.35 if you are touching it).

# Implementation record (2026-09-16)

## Target: **16.3.5**, not 15.x — the task's framing has expired

The task offers 15.x as "the lower-risk hop with a defined support window", noting it is supported through October 2026. It is now **16 September 2026**. A 15.x hop buys roughly one month before landing back on exactly the problem A9 describes, which would mean paying this migration's regression cost twice. The objective is *get off an end-of-life framework*, so the deliberate call is the current major.

| | 15.5.25 | **16.3.5 (chosen)** |
|---|---|---|
| Support runway from today | ~1 month | current major |
| Async `cookies()` / `params` | required | required |
| React 19 | required for App Router | required |
| `next lint` | present | **removed** — lint had to be rewired |
| eslint | 8 acceptable | eslint 9 required by `eslint-config-next` |
| Build bundler | webpack | Turbopack by default |

Both targets require the same React 19 hop, so falling back to 15.x would not have avoided the React Flow question. **This is Manual Step 1 and remains an operator call** — the work is done against 16.3.5 and the reasoning is recorded so it can be overruled.

Versions landed: `next` 16.3.5, `react` / `react-dom` 19.3.0 (exact), `@types/react` 19.x, `eslint` 9.39.5 (exact), `eslint-config-next` 16.3.5.

## The async-request-API migration

Done by hand rather than with `@next/codemod`, and **the codemod checkbox is left unticked** because it was not run. The reason is the checkbox's own clause — "review every change it makes rather than trusting it wholesale". The surface here is small and completely enumerable, so every edit was written and read deliberately instead:

- `lib/supabase/server.ts` — `createServerSupabaseClient()` is now `async` and awaits `cookies()`. That propagated to **28 call sites**; every one was already inside an `async` function, so no component or handler had to change shape.
- Two helper signatures typed as `ReturnType<typeof createServerSupabaseClient>` became `Awaited<...>`.
- **10 dynamic route files.** `RouteContext.params` is now a `Promise`, and each of the 13 handlers takes `context: RouteContext` and does `const params = await context.params;` on its first line. Keeping the local name `params` means every downstream `params.id` reference is untouched — the smallest diff that is still correct.
- `app/(dashboard)/workflows/[id]/page.tsx`, `app/(dashboard)/settings/page.tsx` (`searchParams`), and `app/(auth)/login/page.tsx` (which had to become `async`).
- `app/api/integrations/gmail/callback/route.ts` — the one remaining direct `cookies()` call.

`headers()` is not used anywhere in the app.

## `middleware.ts` is now `proxy.ts`

Next 16 deprecates the `middleware` file convention in favour of `proxy`. Because this file **is** the auth gate, the rename was not taken on trust. `node_modules/next/dist/build/templates/middleware.js` resolves both conventions in one line:

```js
const handlerUserland = (isProxy ? mod.proxy : mod.middleware) || mod.default;
```

Everything after that — the `adapter()` call, the config/matcher handling, the error wrapper — is shared. The rename selects a different property on the same module and changes nothing else, which is why it was safe to do rather than to sit on a deprecation warning.

The file moved with `git mv` so history follows it, and the only content change is the exported function name. The allow-list, the `requiresAuth` logic, the `updateSession()` call, the login redirect and `config.matcher` are byte-identical. CLAUDE.md's invariant row was updated to name `proxy.ts`.

**Runtime equivalence is still the operator's to confirm** — the Middleware line of the manual regression checklist is the most important line in this task, and it is why that Required Change stays unticked.

## `next lint` was removed

Next 16 has no `lint` command, and `eslint-config-next` 16 ships flat config only, so `.eslintrc.json` could not carry over. `npm run lint` is now `eslint .` against a new `eslint.config.mjs` extending the same `next/core-web-vitals` rule set.

`eslint` is pinned to **9.39.5**, not 10.x. eslint 10 removed `context.getFilename()`, and the `eslint-plugin-react` bundled inside `eslint-config-next` 16.3.5 still calls it — `npm run lint` crashes outright on eslint 10. That is an upstream constraint, not a preference.

### Two new lint rules fire on pre-existing code

`eslint-config-next` 16 adds React Compiler readiness rules that did not exist under 14: `react-hooks/refs` and `react-hooks/set-state-in-effect`. Six errors, all in code that predates this upgrade:

| File | Rule | What it is |
|---|---|---|
| `hooks/useBufferedField.ts` (x3) | `react-hooks/refs` | Ref writes during render |
| `components/canvas/ExecutionLog.tsx` | `set-state-in-effect` | Derived open/closed state |
| `components/canvas/RunHistorySidebar.tsx` | `set-state-in-effect` | `setIsLoading(true)` before a fetch |
| `components/canvas/WorkflowSettingsSidebar.tsx` | `set-state-in-effect` | Same pattern |

They are **scoped off for those four files only**, in `eslint.config.mjs`, with the reason in a comment. The rules stay active everywhere else, so no new code can introduce these patterns. Rewriting them would mean changing canvas and hook behaviour to satisfy a framework bump, which this task's Stop Conditions put out of scope — and `useBufferedField` is precisely the file commit `f356261` fixed ("prevent stale and lost node field edits"); its render-time ref writes are what that fix depends on.

**This is real technical debt, not a false positive.** Writing refs during render is unsafe under concurrent rendering and will block adopting the React Compiler. It belongs to a follow-up task with its own regression pass, not to this one.

## Other findings

- **Segment config exports must be literals.** Next 16 rejected `export const maxDuration = EXECUTE_ROUTE_MAX_DURATION_SECONDS` with *"Invalid segment configuration export detected"* and refused to finish the build. Task 04 had made that constant the single source of the value. The route now exports the literal `300`; the constant survives for `RUN_BUDGET_MS`, and a new test in `tests/executionLimits.test.ts` reads the route's source and asserts the literal still matches the constant, so the duplication cannot silently drift.
- **`next.config.mjs`** — `experimental.serverComponentsExternalPackages` moved to top-level `serverExternalPackages`; `turbopack.root` pinned to the repo so Turbopack stops inferring a workspace root from a stray lockfile in a parent directory; the dev-only `webpack` cache-disabling function was **removed**, because dev already ran with `--turbo` and Turbopack is now the build bundler too, which made it dead configuration rather than a behaviour change.
- **`tsconfig.json`** — Next requires `"jsx": "react-jsx"` and adds `.next/dev/types` to `include`. Both applied; the file's original compact formatting was restored so the diff shows only those two facts.
- **`@supabase/ssr` stays at 0.5.2.** It declares no Next.js peer dependency and never calls `cookies()` itself — the cookie adapter is supplied by `lib/supabase/server.ts`, which is what changed. Build, type-check and the auth routes are all clean against it. 0.6 removed the `get` / `set` / `remove` cookie methods that `updateSession()` still uses, so upgrading it would mean rewriting the auth gate's cookie handling *in the same change as the framework upgrade*. Deliberately not done here.
- **React Flow 11.11.4 is unchanged.** Its peer range is `react: ">=17"`, so React 19 satisfies it without an override, and the canvas type-checks and builds. **That is a static result only** — the Stop Condition about a React Flow major was never reached, but the Canvas line of the manual checklist is what actually proves it, so that Required Change stays unticked.
- **`undici` 8.7.0 to 8.10.2.** `npm audit` reported five high-severity advisories against 8.0.0–8.8.0 — CRLF injection via blob body type, cache-directive parsing disclosure, cookie attribute injection — in the client that `lib/http/` uses for every outbound HTTP-node request behind the SSRF guard. In-range patch, direct dependency, security-relevant to a shipped feature.

## Verification

All four automated checks green, and the build emits **no warnings at all** after the config and proxy changes.

## Outstanding

- **The entire manual regression checklist below.** A green build proves compilation, not that the canvas works. Every unchecked line is **HUMAN_UI_CHECK_REQUIRED**; the Middleware and Canvas lines are the two that would most plausibly fail.
- **Gmail and Scheduled-run checklist lines additionally need real external calls** — sending a real email and letting a real schedule fire are operator actions, not agent actions.
- **Preview and production deployment (Manual Steps 2 and 3).** Deployment is a hard stop; local success does not prove serverless success, particularly for streaming and for the proxy rename.
- **Nine transitive `npm audit` advisories remain** (`nanoid` via postcss, `postcss-selector-parser` via tailwind, `browserslist`, `glob`, `brace-expansion`, `@xmldom/xmldom`, `baseline-browser-mapping`, `@vitest/mocker`, `vitest`). None is a direct runtime dependency. `npm audit fix` aborts with an internal npm error (`Cannot read properties of null (reading 'edgesOut')`) in this environment, so they are recorded rather than half-applied — dependency policy belongs to task 12 (B2).
- **The React Compiler lint debt** described above.

# Verification

**Automated**

- [x] `npm test` green.
- [x] `npx tsc --noEmit` clean.
- [x] `npm run build` succeeds.
- [x] `npm run lint` clean.

**Manual â the regression checklist. Do not skip any line.**

- [ ] **Auth:** log in via Google end to end. Log out. Confirm a protected route redirects when logged out and renders when logged in.
- [ ] **Middleware:** confirm session refresh still happens on every request. CLAUDE.md warns that without `updateSession()` users get logged out unexpectedly â that failure is intermittent and easy to miss in a quick smoke test.
- [ ] **Canvas:** load a workflow, drag a node from the sidebar, connect two nodes, resize a node, reload, and confirm dimensions and graph persisted.
- [ ] **Auto-save:** confirm the 700ms debounced PATCH still fires once, not per keystroke.
- [ ] **SSE execution:** run a multi-node workflow and confirm events stream in real time and the run persists to `workflow_runs`.
- [ ] **AI streaming:** confirm AI node output streams rather than arriving in one block.
- [ ] **File upload:** upload a PDF and confirm extraction still works.
- [ ] **Gmail:** connect, send a test email **to yourself only**, confirm the idempotency ledger row is written.
- [ ] **Scheduled run:** let a real schedule fire and confirm the Inngest path completes and persists.
- [ ] **Run history and execution log:** confirm both render, including structured output display.

# Stop Conditions

Stop and ask before proceeding if:

- **React Flow is incompatible with React 19** and the fix requires a React Flow major upgrade. That is a second large migration wearing the first one's clothes â surface it as its own decision.
- `@supabase/ssr` has no compatible version. Do not pin around it or patch it locally.
- **The canvas or SSE streaming breaks in a way that is not a mechanical async-API fix.** Report it; do not redesign the executor or the canvas to accommodate the upgrade. Redesigning load-bearing subsystems is out of scope for an upgrade task.
- Middleware behavior differs in any way you cannot fully explain. This is the auth gate â "it seems to work" is not sufficient.
- The upgrade requires changing the `text/plain` streaming contract or the SSE event shape. Both are named invariants in CLAUDE.md.
- Deploying the upgrade to production is the next step. Deployment is a hard stop.

# Completion Criteria

- `next` and React on the chosen supported major; no EOL dependency remains.
- All four automated checks green.
- **Every line of the manual regression checklist performed and recorded.** A green build proves compilation, not that the canvas still works.
- Middleware auth behavior verified equivalent, explicitly.
- Version references updated in CLAUDE.md.
- `git diff` reviewed â this will be a large diff; review it in sections rather than skimming.

# Manual / External Steps

1. **Decide 15.x vs 16.x.** 15.x is supported through October 2026 and is the smaller hop. 16.x buys runway at higher migration cost. This is an operator call.
2. **Deploy to a preview environment first** and re-run the regression checklist there. Local success does not prove serverless success â particularly for streaming and middleware.
3. **Deploy to production** only after the preview passes.
