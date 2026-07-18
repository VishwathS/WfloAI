# WfloAI — First-User QA & UX Evaluation

**Session:** July 9, 2026 · Tester: acting as first real user (product designer / QA / automation user)
**Method:** Phase A — every feature exercised programmatically through the app's own APIs (15 workflows created and executed). Phase B — full first-time-user session in a real browser (dashboard → canvas → build → run → files → schedules → history), including a live Inngest cron firing.
**Environment:** local `next dev` + `inngest-cli dev`, real Anthropic/Tavily/Supabase keys, dedicated test account.

---

## Part 1 — Workflow-by-workflow results

### WF1 · Hello World (Trigger → AI Generate → Action Display)
- **Expected:** Runs end-to-end, streams output, persists a run.
- **Actual:** ✅ Success in ~2s. Structured `{content}` JSON produced, run persisted with correct timestamps.
- **Problems:** The Action node's output (and the run's `final_output`) is the literal string `Structured output:\n{...}` — the internal context-passing prefix leaks into stored data. The Trigger node reports 414ms for doing nothing (every node seems to carry ~200–300ms overhead, which reads as artificial).
- **UX improvements:** Strip the `Structured output:` prefix before persisting/final display (Quick Win). Don't show a duration on no-op nodes, or show "—" (Quick Win).

### WF2 · Input + AI Summarize
- **Expected:** Input's value flows into the AI node; `{{article}}` in the prompt interpolates.
- **Actual:** ✅ Works; good-quality summary + key points.
- **Problems:** The input text reaches the AI **twice** — once via `{{article}}` interpolation, once via automatic parent-context passing. Wasted tokens and a confusing mental model ("do I need `{{key}}` if context flows anyway?"). Also, my prompt asked for "2 sentences" but the Summarize schema always forces `{summary, keyPoints[]}` — format instructions inside the prompt are silently half-ignored.
- **UX improvements:** Document/hint that upstream context is automatic and `{{key}}` is only for placement (Quick Win: helper text under the prompt box). Consider letting Summarize honor formatting hints or expose "keyPoints on/off" (Future Feature).

### WF3 · Extract with outputFields
- **Expected:** Messy email → clean `{name, company, request, contact}`.
- **Actual:** ✅ Perfect extraction, correct casing and normalization. One of the strongest features.
- **Problems:** In the UI, nothing explains what Extract's output fields are or where to define them (I only found `outputFields` because I read the API). With Extract selected in JSON mode, there's no visible field-list editor on the node.
- **UX improvements:** Add an output-fields chip editor that appears when Extract is selected (Quick Win). Show the expected JSON shape for each action type in the node (Quick Win).

### WF4 · Lookup + variable interpolation
- **Expected:** `{{input}}` in the Lookup query is replaced by upstream text; Tavily results flow to AI.
- **Actual:** ✅ Works; search results well-formatted; AI digest accurate.
- **Problems:** **Two different variable systems**: Lookup uses the magic word `{{input}}` (= "whatever came from upstream"), while AI/Router prompts use `{{key}}` (= a specific Input node's key). A user who learns one convention will misuse the other — `{{input}}` in an AI prompt fails validation unless an Input node is literally keyed `input`.
- **UX improvements:** Unify on one convention — support `{{input}}` as "upstream context" everywhere, plus named keys (Future Feature, high value). Short-term: placeholder text in Lookup's query field showing `{{input}}` usage, and a variables hint in AI prompts (Quick Win).

### WF5 · Router with AI routing
- **Expected:** Classifier output → router decides → only one branch runs.
- **Actual:** ✅ Correct branch ran; skipped branch produced no events.
- **Problems:** The skipped branch has no explicit "skipped" state — idle and skipped look identical in the log and history. The router's own logged "output" is just its input passed through, which looks odd in run history (the router row shows the classifier's JSON, not the decision).
- **UX improvements:** Show the routing decision ("Routed: TRUE") as the router's logged output (Quick Win). Mark skipped nodes as "skipped" in the execution log (Future Feature).

### WF6 · Router with deterministic condition — **BUG FOUND**
- **Expected:** `conditionField: "category"`, `conditionValue: "complaint"` matches the classifier output `{"category": "complaint"}` → TRUE branch, no AI call.
- **Actual:** ❌ **FALSE branch executed.** The deterministic check never ran; the AI fallback silently decided (I'd deliberately primed its prompt with an opposite instruction to prove which path was taken).
- **Root cause:** `buildParentContext()` prefixes AI-node output with `"Structured output:\n"`, so the router's `JSON.parse(context)` in `executeRouterNode` (lib/execution/serverExecutor.ts:266–276; same pattern in executor.ts) always throws and always falls through to AI routing. Deterministic routing can never work when the upstream node is an AI node — its primary use case.
- **Severity:** HIGH — silently wrong behavior, wasted AI tokens, non-deterministic routing the user believes is deterministic.
- **Fix (Quick Win):** strip the prefix before parsing in both executors.

### WF7 · Multi-AI chain (Generate → Rewrite → Classify)
- **Expected:** Structured context survives three AI hops.
- **Actual:** ✅ Flawless — the rewrite consumed the generated pitch; the classifier judged the rewrite ("casual", 0.98). Context passing is solid.
- **Problems:** None functional. Each hop's input includes the growing `Structured output:` blob — fine at 3 nodes, will bloat prompts in long chains.

### WF8 · Text mode (`outputMode: "text"`)
- **Expected:** Plain prose out; no JSON wrapper.
- **Actual:** ✅ Plain text, and the Action node passes it through without any prefix.
- **Problems:** In Text mode the model tends to emit **markdown** (headings, bold, `---`), and the app displays it raw — `# Launch Results Executive Summary` shown literally. Neither "render the markdown" nor "tell the model not to use markdown" happens.
- **UX improvements:** Either render markdown in output panels or append "plain text, no markdown" to text-mode prompts (Quick Win — pick one).

### WF9 · File Input (.txt, .pdf, .csv + negative tests)
- **Expected:** Upload → extract → summarize; friendly failures for scanned/oversized/stale files.
- **Actual:** ✅ All positive paths worked (txt 439 chars, PDF 1 page/333 chars, CSV via the UI Replace button — extraction instant). Scanned PDF → clean 422 message; 6MB txt → "File is too large — the limit for this type is 5.0 MB"; stale fileId at runtime → clear node error ("the uploaded file no longer exists. Re-upload it.").
- **Problems:** The node's **"Ready" badge lies** — I pointed the node at a deleted file and the canvas still showed `ghost.txt · Ready`; only running exposed the truth. Upload has no progress indicator (instant for small files; a 20MB PDF won't be).
- **UX improvements:** Validate `fileId` still resolves when the canvas loads; show a "file missing" state (Quick Win). Upload progress/spinner on the node (Quick Win).

### WF10 · Template (LinkedIn Post Generator)
- **Expected:** Clone → Run works, or clearly guides me.
- **Actual:** ⚠️ Clone → Run fails validation: `"Topic or Idea" (key: topic) needs a value before it can run.` Good message, but the canvas doesn't navigate to the offending node. After filling the topic: ✅ genuinely good LinkedIn post.
- **Problems:** (a) Every template's first Run is an error — that's the *designed* first-run experience, since templates ship with empty inputs. (b) The "LinkedIn post" is full of markdown headings/bold/dividers, which paste terribly into LinkedIn (it doesn't render markdown). The template prompt says "no hashtags" but not "no markdown".
- **UX improvements:** On validation error, pan/zoom to the failing node and focus the empty field (Quick Win). Add "plain text, no markdown formatting" to social-content template prompts (Quick Win). Bigger: prompt for required inputs at Run time instead of failing (Future Feature — a "Run with inputs…" dialog).

### WF11 · Schedules (API + UI + live cron)
- **Expected:** Create schedule, Run now works, real cron fires, runs land in history.
- **Actual:** ✅ All of it. A UI-created schedule (Daily 4:41 PM PT) fired at **4:41:01 PM** via Inngest and persisted a success run. Run-now (202) executed with the `input_values` override correctly applied. Disable nulls `next_run_at`. Invalid cron → 400. Toolbar pill updates to "Next run · Jul 9, 04:41 PM".
- **Problems:** (a) Run-now never sets `last_run_at` — the schedule row claims it never ran right after you pressed Run now. (b) The timezone dropdown is a flat ~430-option list with no search. (c) No way to set `input_values` from the UI even though the backend supports it. (d) No "next occurrences" preview to confirm the cron you built.
- **UX improvements:** Searchable timezone combobox defaulting to browser TZ (Quick Win). Update `last_run_at` on Run-now (Quick Win). Per-schedule input-values editor (Future Feature). Next-occurrences preview (Quick Win).

### WF-E · Error paths
| Case | Result | Message quality |
|---|---|---|
| Cycle | 400 | ✅ "contains a cycle — remove the circular connection" |
| No entry node | 400 | ⚠️ "Add an Input node…" — a Trigger or File Input also qualifies |
| Undefined `{{var}}` | 400 | ✅ "references undefined input(s): {{topicc}}" — excellent |
| Router branch with no edge | **200 "success"** | ❌ Router routed TRUE, no TRUE edge existed → run silently ended, recorded as success |
| Orphan (disconnected) node | 200 | ⚠️ Silently skipped; no indication anywhere |
| Empty AI prompt | 400 | ✅ clear, plus live error badge on canvas |

---

## Part 2 — Browser-only findings (first-time-user lens)

1. **Dashboard "Last run" is wrong for every workflow that has actually run** — it reads the legacy `execution_logs` table while real runs persist to `workflow_runs`. My most-exercised workflow said "Never"; the only one showing a time was the one I'd hit the legacy `/logs` endpoint on directly. **HIGH bug — tells every user their runs didn't count.**
2. **Typing into node fields drops characters.** Fast keyboard input into the Input node's value produced "ativation", "invite tep", "conversio" — keystrokes land while the full `setNodes` array-map re-render is in flight. Twice a just-typed value was wiped entirely (once after editing the label, once after dropping a new node onto the canvas; confirmed lost in the saved graph, not just visually). **HIGH — text loss in the primary editing surface.**
3. **Stale validation badge.** The red "2 errors" pill kept showing after both errors were fixed and even after a fully successful run.
4. **Node cards aren't clickable.** Sidebar cards are focusable `<button>`s; clicking does nothing — drag is the only path and nothing says so. Click-to-add is the expected fallback in every comparable tool.
5. **Renaming an Input silently renames its key** (label "Launch notes" → `{{launchNotes}}`). Downstream prompts referencing the old key break with no warning until run time.
6. **Two save indicators** ("Saved automatically" + "All changes saved" pill) a few pixels apart.
7. **"No triggers" pill doesn't look tappable** — it reads as status text, but it's the only way into Workflow Settings/Schedules. First-time users will not find scheduling.
8. **Node headers never show the user's label** — every Input reads "Input / Information for this workflow" at canvas zoom; you can't tell nodes apart without opening them.
9. **Lookup is categorized under "Sources"** but can't start a workflow — starting with it yields "Add an Input node…".
10. **Disabled "coming soon" toolbar buttons** (Pointer/Hand) are noise for a first user.
11. **Execution log** is a thin bottom strip; markdown outputs render as raw text. The History sidebar itself is good (status chips, previews, hover-delete), but run rows lack duration/node count.
12. **No Trigger node in the sidebar** although the engine and copy ("Arrange triggers, AI steps…") reference triggers — vocabulary and placeable nodes disagree.

---

## Part 3 — Prioritized findings

### Critical / High
| # | Finding | Label |
|---|---|---|
| 1 | Deterministic router routing never works after an AI node — prefix breaks `JSON.parse`, silent AI fallback (WF6) | **Quick Win** (strip prefix before parse, both executors) |
| 2 | Dashboard "Last run" reads the wrong table — always "Never" | **Quick Win** (query `workflow_runs`) |
| 3 | Keystroke loss / value wipes when typing in node fields | Targeted debounce **Quick Win**; proper per-field local state **Future Feature** |
| 4 | Router dead-end branch = silent "success" run | **Quick Win** (warn/error when the routed handle has no edge) |
| 5 | `Structured output:` prefix leaks into Action outputs and `final_output` | **Quick Win** |

### Medium
| # | Finding | Label |
|---|---|---|
| 6 | Stale "N errors" badge never clears | Quick Win |
| 7 | File Input shows "Ready" for a nonexistent file | Quick Win |
| 8 | Template first run always errors; no scroll-to-error | Quick Win (scroll-to-error) / Future Feature (run-time inputs dialog) |
| 9 | Two variable conventions (`{{input}}` vs `{{key}}`), undocumented in-product | Quick Win (hints) / Future Feature (unify) |
| 10 | Input rename silently rewrites `{{key}}`, breaking prompts | Quick Win (warn or auto-update references) |
| 11 | Raw markdown in text outputs; social templates emit markdown | Quick Win (prompt suffix) or Future Feature (render md) |
| 12 | Skipped/orphan nodes indistinguishable from idle | Future Feature |
| 13 | Run-now doesn't update `last_run_at` | Quick Win |
| 14 | `input_values` overrides have no UI despite backend support | Future Feature |

### Low / polish
| # | Finding | Label |
|---|---|---|
| 15 | No click-to-add for node cards, no "drag me" hint | Quick Win |
| 16 | "No triggers" pill hides the scheduling entry point | Quick Win |
| 17 | Node headers don't show the node's label | Quick Win |
| 18 | Duplicate save indicators | Quick Win |
| 19 | Timezone dropdown: ~430 flat options, no search, no browser-TZ default | Quick Win |
| 20 | Lookup under "Sources" though it can't start a flow | Quick Win |
| 21 | "Coming soon" disabled toolbar buttons | Quick Win |
| 22 | Extract's `outputFields` invisible/uneditable on the node | Quick Win |
| 23 | "Add an Input node" wording ignores Trigger/File Input | Quick Win |
| 24 | No "next occurrences" preview for schedules | Quick Win |

### What's genuinely good (keep it)
- Context propagation across multi-AI chains is reliable; Extract is excellent; Lookup results are well-formatted and useful downstream.
- Scheduling backbone: the cron fired **within 1 second** of its scheduled minute; Run-now, disable, invalid-cron validation, and run persistence all behaved exactly right.
- File pipeline: instant extraction, and every negative path (scanned PDF, oversize, stale file) fails with a genuinely human error message.
- Live canvas validation with per-node messages ("references undefined input(s): {{topicc}}") is better than most shipping competitors.
- Run history sidebar and per-node "View output" affordances are clean and discoverable.

### Top 3 first-run-experience fixes if you only do three
1. **Fix dashboard "Last run" (#2)** — it tells every new user their runs didn't count.
2. **Fix typing reliability on the canvas (#3)** — losing typed text in the first minute of use is fatal to trust.
3. **Make templates runnable out of the gate (#8 + #11)** — scroll-to-error + plain-text prompts; templates are the intended "wow" moment and currently open with an error.
