# Objective

Get off an end-of-life framework. Next.js 14 reached EOL on 26 October 2025 and 14.2.35 was its final patch. 2026 advisories affecting 13.x/14.x App Router (CVE-2026-23869, CVE-2026-23870, CVE-2026-23864) will **not** be patched for 14.x.

This matters more here than in a typical app: `middleware.ts` *is* the authentication gate, and the unpatched advisory lineage includes middleware bypass and cache poisoning. That combination is a direct compromise path, not a theoretical one.

**This is the longest pole in the plan.** Start it early and let it run alongside the documentation-heavy tasks. It should finish while policies are being drafted, not block the Google submission.

# Audit Items

**A9** (Next.js 14.2.35 is end-of-life)

# Current State

`next` is pinned at **14.2.35** (App Router). Supporting stack: TypeScript 5.7, React Flow 11.11.4, `@supabase/ssr` 0.5, Tailwind 3.4, Node 22.x.

The audit's estimate is **2–4 days including regression testing**, driven by two breaking-change surfaces:

1. **Async `headers()` / `cookies()`.** This touches **every** Supabase server-client call site — `lib/supabase/server.ts` and every Server Component and API route that uses it. Mechanical but wide.
2. **React 19.** Ecosystem compatibility, particularly React Flow.

Target: 15.x (supported through October 2026) or 16.x.

# Required Changes

- [ ] Upgrade `next` and `react` / `react-dom` to the chosen target. Decide 15.x vs 16.x deliberately — 15.x is the lower-risk hop with a defined support window; 16.x buys more runway at more migration cost.
- [ ] Run the official codemod where available, then review every change it makes rather than trusting it wholesale.
- [ ] Convert all `headers()` / `cookies()` call sites to the async form, starting from `lib/supabase/server.ts` and following the call graph outward.
- [ ] Verify `@supabase/ssr` is at a version compatible with the target Next.js. If it is not, that is a blocker to resolve before proceeding, not a thing to work around.
- [ ] Verify React Flow 11.11.4 works under React 19. If it does not, the upgrade path may require a React Flow major — see Stop Conditions.
- [ ] Re-verify `middleware.ts` behaves identically after upgrade. Middleware is the auth gate; a subtle behavior change here is the single most dangerous outcome of this task.
- [ ] Re-verify the SSE streaming path in `app/api/workflows/[id]/execute/route.ts` and the `text/plain` streaming contract in `app/api/execute/route.ts`. CLAUDE.md lists both as invariants — `requestAIText()` in `lib/execution/executor.ts` reads raw chunks and will break silently if the response shape changes.
- [ ] Re-verify `app/api/inngest/route.ts` including its `maxDuration = 300`.
- [ ] Update the `next` version reference wherever it is documented (CLAUDE.md tech-stack table; README — though README is task 12's problem, do not leave it asserting 14.2.35 if you are touching it).

# Verification

**Automated**

- [ ] `npm test` green.
- [ ] `npx tsc --noEmit` clean.
- [ ] `npm run build` succeeds.
- [ ] `npm run lint` clean.

**Manual — the regression checklist. Do not skip any line.**

- [ ] **Auth:** log in via Google end to end. Log out. Confirm a protected route redirects when logged out and renders when logged in.
- [ ] **Middleware:** confirm session refresh still happens on every request. CLAUDE.md warns that without `updateSession()` users get logged out unexpectedly — that failure is intermittent and easy to miss in a quick smoke test.
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

- **React Flow is incompatible with React 19** and the fix requires a React Flow major upgrade. That is a second large migration wearing the first one's clothes — surface it as its own decision.
- `@supabase/ssr` has no compatible version. Do not pin around it or patch it locally.
- **The canvas or SSE streaming breaks in a way that is not a mechanical async-API fix.** Report it; do not redesign the executor or the canvas to accommodate the upgrade. Redesigning load-bearing subsystems is out of scope for an upgrade task.
- Middleware behavior differs in any way you cannot fully explain. This is the auth gate — "it seems to work" is not sufficient.
- The upgrade requires changing the `text/plain` streaming contract or the SSE event shape. Both are named invariants in CLAUDE.md.
- Deploying the upgrade to production is the next step. Deployment is a hard stop.

# Completion Criteria

- `next` and React on the chosen supported major; no EOL dependency remains.
- All four automated checks green.
- **Every line of the manual regression checklist performed and recorded.** A green build proves compilation, not that the canvas still works.
- Middleware auth behavior verified equivalent, explicitly.
- Version references updated in CLAUDE.md.
- `git diff` reviewed — this will be a large diff; review it in sections rather than skimming.

# Manual / External Steps

1. **Decide 15.x vs 16.x.** 15.x is supported through October 2026 and is the smaller hop. 16.x buys runway at higher migration cost. This is an operator call.
2. **Deploy to a preview environment first** and re-run the regression checklist there. Local success does not prove serverless success — particularly for streaming and middleware.
3. **Deploy to production** only after the preview passes.
