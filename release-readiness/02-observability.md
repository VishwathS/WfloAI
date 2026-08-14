# Objective

Make failures visible. Today a scheduled workflow that breaks every morning fails silently forever, and there is no signal anywhere that it happened. This task adds the minimum needed to answer "did the private beta actually go well?" — which is Phase 1's exit criterion.

**Scope is deliberately capped.** This is not a full observability rollout. Error reporting, structured logging in the `catch` blocks that currently swallow, and a distinguishable log line for the three failure classes that matter. Nothing more.

# Audit Items

**A7** (minimum observability)

# Current State

There is no Sentry, no logger library, no `instrumentation.ts`, and no structured logging anywhere in the application.

The entire app contains **one `console.*` call**: `app/error.tsx:12`, client-side.

Zero logging exists in any API route, anywhere in `lib/`, or in any Inngest function. Against that, the audit found roughly **ten silent `catch {}` blocks on security-relevant paths**, including:

| Location | What is swallowed |
|---|---|
| `app/api/integrations/gmail/callback/route.ts:86` | Gmail OAuth token-exchange failure |
| `app/api/workflows/[id]/execute/route.ts:130` | The fatal execution handler |

Separately, most API routes return the raw Postgres `error.message` to the client — for example `app/api/credentials/route.ts:27`. That leaks schema detail and is the wrong direction of information flow: the detail should go to the operator's error reporter, and a generic message should go to the user.

The consequence in practice: `runScheduledWorkflow` persists a `status: "error"` run row and advances `next_run_at`. Nobody is notified. The failure is durable, repeating, and invisible.

# Required Changes

- [ ] Choose and wire an error reporter covering **both** server and client. Sentry is the obvious default but is not required — the audit's constraint is capability, not vendor. Whatever is chosen must capture unhandled server exceptions, unhandled client exceptions, and manually reported errors.
- [ ] Add a small structured logging helper in `lib/`. It does not need to be a logging framework; it needs consistent shape (level, message, context object) and it must never log secrets — reuse `lib/integrations/redact.ts` on any value that could carry credential material.
- [ ] Replace the swallowed `catch {}` blocks on security-relevant paths with reported errors. Start with the two named above; sweep for the rest rather than assuming the audit's count of ~10 is exact.
- [ ] Emit a **distinguishable log line** for each of the three failure classes that matter operationally:
  - a scheduled run that finishes with `status: "error"`
  - a Gmail send that fails
  - an HTTP-node mutation that fails

  "Distinguishable" means greppable/filterable by a stable event name, not buried in prose.
- [ ] Stop returning raw Postgres `error.message` to clients. Generic message to the user; full detail to the reporter. `app/api/credentials/route.ts:27` is the template case — apply the same treatment across routes.
- [ ] Confirm the client-side reporter is wired into `app/error.tsx` and `app/global-error.tsx`. Note that task 01 removes the `error.message` render from `global-error.tsx`; these two changes must agree rather than fight.

# Verification

**Automated**

- [ ] `npm test` green.
- [ ] `npx tsc --noEmit` clean.
- [ ] `npm run build` succeeds.
- [ ] A unit test asserting the logging helper redacts credential-shaped values rather than passing them through.

**Manual**

- [ ] Deliberately break a scheduled workflow (for example, point an HTTP node at a URL that 500s) and confirm the failure produces both a `workflow_runs` error row **and** a visible signal in the reporter.
- [ ] Trigger a server exception and confirm it reaches the reporter with usable stack context.
- [ ] Trigger a client exception and confirm the same.
- [ ] Grep the reporter/log output for a credential value used in a test run — it must not appear. This is the check that matters most; a logging layer that leaks tokens is worse than no logging layer.
- [ ] Confirm an API error response body no longer contains Postgres detail.

# Stop Conditions

Stop and ask before proceeding if:

- The reporter choice implies a paid plan, a new vendor account, or a DSN/secret that must be created. **Creating or exposing secrets is a hard stop.** Document what is needed and hand it over.
- Wiring the reporter requires adding a subprocessor not yet named in the privacy policy. Task 07 must know about it — record the dependency rather than quietly adding a data recipient.
- The scope starts expanding toward tracing, metrics, dashboards, or APM. That is explicitly out of bounds for this task.
- Redaction cannot be applied cleanly to some log path. Do not ship the log line "temporarily" without redaction.

# Completion Criteria

- Error reporting live on both server and client, verified by a real thrown error in each.
- No remaining silent `catch {}` on a security-relevant path — enumerate what was found and what was changed.
- The three failure classes each emit a distinguishable, greppable line.
- No raw Postgres error text reaches a client response.
- Redaction verified by search, not by inspection.
- All three verification commands green; `git diff` reviewed.

# Manual / External Steps

1. **Create the error-reporting account and project** (Sentry or equivalent) and provision the DSN. The agent must not create this secret.
2. **Add the DSN to the host's environment configuration** for production. Never commit it.
3. **Confirm the reporter's data-retention setting** and note it — task 07's privacy policy has to state which subprocessors receive data, and an error reporter that captures request context is one of them.
4. **Set up a notification channel** (email or similar) so failed scheduled runs actually reach you. A reporter nobody looks at is not observability.
