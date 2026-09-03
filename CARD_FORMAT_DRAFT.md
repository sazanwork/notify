# Card format — final, approved by owner on 20.08.2026

> Amended 03.09.2026 (v1.15.0): links ride on the NAME on line 2 (run, report,
> job) and on the commit hash; a PR/issue line 2 is `PR #414 · title` with the
> number as the link; the `Source:` row is gone, the last block keeps only
> `Check:` and `Log:`. GitHub Markdown bodies are translated to Telegram
> markup; merged/closed cards keep the body's first section only. Person rows
> are printed always, the owner included — the same set of rows on every card,
> so an absent row means an empty field. A job says where it ran in a `Via:`
> row and how long it took in a `Took:` row. A zero that did not move is not
> printed.
>
> Amended again 03.09.2026 (v1.16.0): the bracket on the type word says HOW IT
> ENDED, in one word, on every type that has more than one outcome — `Deploy
> (OK)`, `CI (Fail)`, `Job (Off)`, `Job (Silent)`, `Issue (Assigned)`, `PR
> (Merged)`. One slot, one meaning. `Incident` has a single state and carries
> no bracket: what burns is the name after the colon. `Report` has no outcome
> at all, so its bracket keeps the day. The `session` type is folded into
> `incident` — still accepted from old senders, never printed as `#session`. The tables below describe the 20.08 shape and are kept as history.

**Status: approved in Telegram and live in `render.ts` since 1.4.0.** Live-tested
across ~15 rounds in the "Mac-config" Ops forum (chat_id `-1004442522004`,
message_thread_id `2`), messages 169–182, each round checked against the
Bot API's own entity response (not eyeballed) plus an independent
acceptance-check agent that never saw the builder's report. Final owner
sign-off pending on this exact document.

## Skeleton — one shape, every type

```
#type #instance
<icon> <b>Type:</b> action

<b>Field:</b> value
<blockquote>quoted content, if any — commit body, issue body</blockquote>

<i><u>Group name</u></i>
<b>#N:</b> <a href="...">title</a>
<b>#N:</b> <a href="...">title</a>

<b>Field:</b> value  ← actions/direction tier
```

Three tiers, three distinct treatments — never mixed:

1. **Field label** (a single fact): `<b>Label:</b> value`. Capitalized first
   letter (`Commit:`, `Workflow:`, `Reason:`), value plain, never both bold.
2. **Group header** (introduces a list of ≥2 similar items): `<i><u>Name</u></i>`,
   no colon, no bold. First word capitalized. Items inside are field-labels
   in their own right (`<b>#243 (overdue):</b> <a>title</a>`).
3. **Type line** (line 2): icon outside bold, `<b>Type:</b> action` — same
   field-label rule, not a special case.

Blank line separates blocks by MEANING, never mechanically: header block
(tags + type line) is one unit, no blank inside it. The object/content block
(commit+quote, or a plain `reason:` sentence, or a set of groups) is one
unit — no blank between a field and its own quote. Exactly one blank before
the object block and exactly one blank before the actions block, when either
exists.

## Rules with no exceptions

- Hashtags are FIRST LINE, plain text (not in `<code>`/`<a>` — breaks
  hashtag recognition). Hyphens break a hashtag mid-word — project/instance
  names with a hyphen use underscore (`#mac_config`, `#github_board_sync`).
- Two tags always: `#type` (event kind — `ci`, `deploy`, `job`, `heartbeat`,
  `pr`, `issue`, `report`, `incident`, `file`) and `#instance` (what this
  specific one is about — branch, environment, job slug, `#p294`, `#i322`).
  **This instance tag is the machine key `ops-reactor` matches red↔green
  on** — see the required accompanying change below.
- No `link_preview_options: {"is_disabled": true}` on `sendMessage` (already
  set in `send.ts:38`) — GitHub commit/issue links otherwise drag an empty
  preview card. `sendDocument` (file type) has no such parameter and needs
  none — captions aren't scanned for previews.
- A quoted body (`<blockquote>`, `expandable` when long) never repeats the
  title that's already the link text next to it.
- `commit:`/`pr:`/`issue:` unify to ONE shape: label → bare identifier as a
  link (hash or `#N`) → blockquote holding the human title (+body, if any).
  No duplication between the link text and the quote.
- A local filesystem path (`logs:` on an incident) is `<code>`, not a link —
  it has no URL, `<code>` lets a tap copy it. A GitHub URL (`workflow:`) is
  always a real link.
- `open`/`untriaged`-style summary counts are NOT shown when the groups
  above already list every item — a bare number under three full groups is
  a pure duplicate and gets deleted, not displayed.
- Machine-authored text — labels, reasons, descriptions the robot itself
  writes — is English throughout, no exceptions for brand names (`ga4
  users:`, `google clicks:` stay literal English words). Human-authored
  quoted content (a commit body, an issue title from GitHub) stays in
  whatever language it was actually written in.

## Icon = status, not type (four only)

- 🔴 broken — needs a look
- 🚨 incident — live, urgent
- ✅ succeeded (`resolved` action = a red card the daily reactor closed)
- ℹ️ informational, no action needed

## REQUIRED accompanying change — not optional, found during final review

`~/.claude/scheduled-tasks/ops-reactor/SKILL.md` STEP 2 currently extracts
the matching key as **"the last line matching `#<slug>`"** — that was true
of the OLD format, where a single combined key sat on its own line at the
bottom (`ключ — #ci-arvent`). This format has NO such line: both tags live
on line 1, and the type tag is the same for every instance while the
instance tag (`#master`, `#i322`, `#vps_backups`) is what actually
identifies "this specific thing." Porting the new render without updating
STEP 2 makes the reactor blind to every red↔green match, and — because
"silence is the report" is its OWN failure mode — it would silently stop
suppressing repeats and start filing a fresh GitHub issue on the same
standing problem every day.

Fix: STEP 2 reads the key from line 1's SECOND tag (the instance tag), not
"the last line". Old cards from before the format change (no matching
scheme) keep the existing title-word fallback already described in STEP 2.

## Full type catalogue, field mapping

| `#type` | Type line | Object block | Actions |
|---|---|---|---|
| `ci` | `CI: ok` / `CI: resolved` | `commit:` → hash → quote | `workflow:` |
| `deploy` | `Deploy: ok` | `commit:` → hash → quote | `workflow:` |
| `job` | `Job: fail` / `Job: disabled` | `reason:` sentence, or `reason:` + numbered list group | `workflow:` (if applicable) |
| `heartbeat` | `Heartbeat: miss` / `Heartbeat: ok` | `reason:` sentence | — |
| `pr` | `PR: opened/merged/closed/…` | `pr:` → `#N` → quote(title) | `author:` |
| `issue` | `Issue: opened/closed/…` | `issue:` → `#N` → quote(title[+body]) | — |
| `report` | `Report: tasks · date` / `Report: analytics · date` | groups (board columns / metric list) | `links:` group if analytics |
| `incident` | `Incident: open` | `reason:` sentence | `logs:` (code, local path) |
| `file` | `File: new` | `reason:` sentence (caption) | — |

PR/Issue actions beyond the two demonstrated live (`merged`, `opened`)
share the identical structural template — only the action word and quoted
content change, verified by the render logic itself (`renderPr`/`renderIssue`
branch on `e.action` for the type-line word only, the object block is
action-independent). Not separately live-tested; low risk given the shape
is data-driven, not action-driven.

## Not covered by this document

Daily digest's own item-icon scheme (🔴🟡🟢⚪ inside `daily-digest.sh`'s
task bullets) is a SEPARATE, pre-existing decision (task priority within a
project's own board) — out of scope here, tracked as a follow-up task per
the original plan.
