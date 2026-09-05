/**
 * The event catalogue — the single entry point for sending. `notify()` (see
 * `send.ts`) accepts ONLY values of this type: there is no free text in the
 * API, so a "custom" message cannot technically be written.
 *
 * The schema evolution rule (there is no version and never will be — a
 * message lives one second and is read by eyes, there is nothing to
 * version):
 *   - a new field on an EXISTING type is added ONLY as optional;
 *   - required fields are never added — only a new event type.
 * That keeps old caller code and a new package compatible both ways.
 */

// `vault` is not a product, it is infrastructure: a secrets safe. It needs a
// forum for the same reason projects do: a robot needs somewhere to write.
// There are no people there.
export type Project = 'playhub' | 'one-q' | 'zabukai' | 'game-publisher' | 'vault' | 'mac-config' | 'alitools';

/**
 * A stable machine key for the task — the instance tag on the FIRST line of
 * every card, shaped as `#key` (with no project name: the card already sits
 * in its own project's forum — `targets()` never sends it to someone else's).
 * The
 * daily parser uses it to check "is this 🔴 already closed by a later card
 * with the same key?" without comparing human wording, which changes. It
 * is optional: without it, the key is derived from the type and the title
 * (see `render.ts`), but a derived one inherits the fragility of wording —
 * our regular senders pass it explicitly. The key never reaches CLI output
 * (stderr, which the VPS watchdog also reads as one combined stream by the
 * words `sent|failed|skipped`) — a new word there would blind the
 * watchdog.
 */
/**
 * The common part of any event. `path` is a local file that travels WITH the
 * card: the card becomes a caption on the attachment. There has been no
 * separate `file` type since 25.08.2026 — an Zabukai run used to send the
 * verdict and the log as two cards about one piece of news.
 */
type Keyed = {
  key?: string;
  /** A local file; the card goes out as its caption (caption limit 1024). */
  path?: string;
  /** The file's name in the chat; defaults to the name from `path`. */
  filename?: string;
  /**
   * The verification command — `Check:` in the card's last block, monospaced
   * and tap-to-copy. The standard (v2.1, rule S) wants every card to say
   * where to verify it: a `Source:` link when the event has a canonical URL,
   * this command when the event is local. Usually `config jobs --log <key>`.
   */
  check?: string;
  /**
   * Set by the send-side suppression, never by a caller: which day of the
   * same unresolved failure this is. Renders as `Still red: day N`.
   */
  stillRed?: number;
};

/**
 * A list item inside a message: a task from a digest, a failed check, a
 * remark. `url` is optional — then it renders as a plain row.
 */
/**
 * `label` — an optional bold prefix before `text` (`#243 (overdue)`,
 * `#287`) for items inside a report's named groups. Without `label` an
 * item renders as an ordinary numbered/bulleted row — that is already how
 * digest tasks and the list of disabled workflows work.
 */
/**
 * `group` — the name of the block the item will sit under. The same law
 * `lines` and `stats` follow: without a name the item goes into the
 * general list, as before.
 *
 * Introduced because the import list was mixing three DIFFERENT things in
 * one listing and telling them apart by an icon at the start of the row:
 * 🆕 came out today, 🔁 came out of the queue, ⚠ did not come out at all.
 * The icon was doing a heading's job.
 */
/**
 * `facts` — sub-rows under an item, indented, each `label: value`. For an
 * item whose own value is not one number but several (a search query with
 * its own clicks AND position) — a nested list, not a sentence stuffed into
 * `text`: "0 clicks, pos. 55" was two facts hand-joined into a string, the
 * exact shape that gets pulled apart into its own field everywhere else.
 */
export type Item = {
  text: string;
  url?: string;
  label?: string;
  group?: string;
  facts?: Array<[label: string, value: string | number]>;
};

export type NotifyEvent = Keyed &
  (
  /** Shipping code to the server. */
  | {
      type: 'deploy';
      project: Project;
      status: 'ok' | 'fail';
      commit?: string;
      /** A link to the commit — the "commit" row becomes clickable. */
      commitUrl?: string;
      /** The commit's title — joins the `Commit:` row after the hash, the body follows as a quote. */
      commitTitle?: string;
      /** The commit's body, if there is one — the same quote shape as the title. */
      commitBody?: string;
      /** The commit's author (GitHub login) — the `Author:` row links to their profile. */
      commitAuthor?: string;
      workflowUrl?: string;
      /** The run's name, for the link's visible text. Without it, the type line itself becomes the link. */
      workflowName?: string;
      url?: string;
      /**
       * Where it shipped to. Fill it in ONLY when there is more than one
       * environment: on sites with a single prod, "where: prod" is a row
       * the eye reads and learns nothing from.
       */
      target?: string;
      /**
       * Where it was run from: "manually from the Mac," "GitHub Actions."
       * This is exactly the news — there are two deploy paths, they carry
       * different consequences (a manual one runs from the laptop and takes
       * its variables from the local .env), and the card shows which one
       * fired.
       */
      via?: string;
      /** An explanation: why a post-deploy run was cancelled/skipped. */
      note?: string;
    }
  /** A recurring scheduled task: a game import, a DB backup, a validator. */
  | {
      type: 'job';
      project: Project;
      job: string;
      /**
       * `disabled` — the task was switched off from outside (GitHub Actions
       * ran out of free minutes, for example), it did not fail on its own.
       *
       * `silent` — the task did not report in on time: it did not fail, it
       * gave no sign of life at all. This is a state of the TASK, not a
       * separate event type — it used to live under the type
       * `heartbeat_miss`, and the owner rightly asked why one scheduled task
       * of his carried two different tags. Worse: the silence watchdog sends
       * the same machine key as the task itself, so a red card
       * `#heartbeat #daily_import` did not get closed by a green
       * `#job #daily_import` — the parser looks for a pair by the FULL tag.
       * One stream per task fixes that.
       */
      status: 'ok' | 'fail' | 'disabled' | 'silent';
      /**
       * The one sentence that says why this card exists at all («reporting
       * again»). It has no bracket of its own any more — the bracket on a job
       * carries the outcome — and prints in the `Reason:` row, but only when
       * the sender left `note` empty; a real reason is never duplicated.
       * The field stays for the senders that still pass it.
       */
      aside?: string;
      /**
       * WHERE the job ran, one word from the sender: `mac` (launchd on this
       * Mac), `vps` (a cron on the server), `actions` (GitHub Actions). Any
       * other word is passed through and capitalised. It prints as a `Via:`
       * row directly under the type line — it is a fact ABOUT the run, and
       * the bracket on the type word belongs to the outcome. Until now the
       * Mac's launchd, a
       * VPS cron, GitHub Actions and the silence watchdog all arrived under
       * one bare `#job` tag and only memory told them apart; deploy has said
       * «via GitHub Actions» from the start, and job now does too
       * (03.09.2026).
       */
      via?: string;
      /**
       * How long the run took, in the sender's own words: `4m 12s`, `38s`.
       * Printed as a `Took:` row right under the reason. Absent — no row:
       * a job that does not measure itself must not be made to say `0s`.
       */
      duration?: string;
      /** How often the task owes a check-in — for `silent` and for recovering from it. */
      expected?: string;
      /** When it was last seen. */
      lastSeen?: string;
      /**
       * Numbers from the sender. The third element is the GROUP NAME the
       * row will sit under. The owner asked for groups six times, and every
       * time the sender was already trying to fake them with whatever was
       * at hand: parentheses in the label ("GA4 users (sum of days)"), an
       * icon at the start of the row (🆕 versus ⚠), an extra row at the
       * bottom. There was nothing to group with — now there is.
       *
       * Without the third element the row goes with no heading, as before:
       * every existing sender keeps working unchanged.
       */
      stats?: Array<[label: string, value: string | number, group?: string]>;
      /** Details: exactly what failed, notes from the run; for `disabled` — the list of switched-off processes (each with its own link). */
      items?: Item[];
      note?: string;
      /**
       * A command for him to run, rendered monospaced so Telegram makes it
       * tap-to-copy. For the case where the card names something on this Mac
       * that no URL can reach — a stopped local session, a latch file.
       */
      command?: string;
      /**
       * WHAT that command does. The owner, on a bare `rm` in a card: "I'm
       * about to type it and do god knows what, I don't even know what I'm
       * doing." A command he cannot read is one he cannot run, so it never
       * travels alone.
       */
      commandNote?: string;
      /**
       * A local log path — monospaced, not a link, same as on an incident.
       * It used to be glued onto the end of the reason sentence behind a
       * colon, which is what made a red card read as one long run-on line.
       * Under rule S it is an ADDITION to `check`/a link, never the card's
       * only pointer — a path cannot be tapped, only copied.
       */
      logs?: string;
      /**
       * A multi-line quoted block with its own caption (`detailLabel`) — the
       * shape the watchdog uses to show the offending card's first lines
       * under `Offender:`. Generic on purpose: any job with a verbatim
       * excerpt to show (someone else's text, not the sender's own words)
       * uses this instead of stuffing it into `note`.
       */
      detail?: string;
      /** The caption over `detail`; defaults to `Detail`. */
      detailLabel?: string;
      workflowUrl?: string;
      /** The run's name, for the link's visible text. Without it, the type line itself becomes the link. */
      workflowName?: string;
      /**
       * A fallback name for the run link: half the senders send it as
       * `--url`. The renderer takes `workflowUrl ?? url`, so both names
       * work. In new calls prefer `workflowUrl` — it says where it leads.
       */
      url?: string;
    }
  /** A summary with numbers: a daily report, an analytics digest. */
  | {
      type: 'report';
      project: Project;
      title: string;
      /**
       * Printed in brackets after the title — which day the report covers, or
       * which day its arrows are measured against. Same slot, same name, as a
       * job's. `period` is the old spelling of this field and the CLI still
       * accepts `--period` for it.
       */
      aside?: string;
      /**
       * Renders even when `groups` is also set — a report's headline numbers
       * (Pages, People, Impressions…) sit above the grouped section, not
       * replaced by it. `lines` and `groups` answer different questions:
       * "what changed" and "what's in each list".
       */
      lines?: Array<[label: string, value: string | number, group?: string]>;
      /**
       * A list of items with links — for task digests, where the value is
       * in the names themselves, not in a number. Renders as a separate
       * block after `lines`. Ignored (not merged, not an error) when `groups`
       * is also set — no live sender sets both today.
       */
      items?: Item[];
      /**
       * Named groups (a task board: Ready/In Progress/Not on the board;
       * analytics: Top search queries) — each with its own heading and list
       * of items. Replaces `items` when set, but `lines` still renders above
       * it — see that field's own doc.
       */
      groups?: Array<{ name: string; items: Item[] }>;
      url?: string;
    }
  /** The CI outcome on the main branch. */
  | {
      type: 'ci';
      project: Project;
      status: 'ok' | 'fail';
      branch?: string;
      commit?: string;
      /** A link to the commit — the hash becomes clickable. */
      commitUrl?: string;
      /** The commit's title (subject) — joins the `Commit:` row after the hash, not a quote. */
      commitTitle?: string;
      /** The commit's body (after the subject) — the same quote shape as the title. */
      commitBody?: string;
      /** The commit's author (GitHub login) — the `Author:` row links to their profile. Distinct from `actor`: on a scheduled run `actor` is whoever is on duty to fix it, not who wrote the code. */
      commitAuthor?: string;
      actor?: string;
      /**
       * Why this run happened, when there is no commit to point at: a nightly
       * schedule, a manual press. Renders as `Reason:`, same as on deploy.
       */
      note?: string;
      /** A link to the run (workflow run) — separate from `url`, a fallback for `workflowUrl`. */
      workflowUrl?: string;
      /** The run's name, for the link's visible text. Without it, the type line itself becomes the link. */
      workflowName?: string;
      url?: string;
    }
  /**
   * A pull request event. The kinds cover the whole life of a PR, because
   * the owner follows the team's work through the Ops tab, not through
   * mail: mail only arrives when you were personally pinged, and half of
   * the events never reach it.
   */
  | {
      type: 'pr';
      project: Project;
      action:
        | 'opened'
        | 'approved'
        | 'changes_requested'
        | 'merged'
        | 'closed';
      number: number;
      title: string;
      /**
       * On `opened`: the PR's own description. On `approved`/
       * `changes_requested`: the reviewer's comment, not the PR's
       * description again — quoted on its own either way; the title joins
       * the `PR:` type line above it, there is no separate field for it.
       */
      body?: string;
      author?: string;
      reviewer?: string;
      url?: string;
    }
  /** An issue event: filed, taken up, closed. */
  | {
      type: 'issue';
      project: Project;
      action: 'opened' | 'assigned' | 'closed';
      number: number;
      title: string;
      /** The issue's body — a quote under the `Issue:` type line, which already carries the title. */
      body?: string;
      author?: string;
      assignee?: string;
      url?: string;
    }
  /** The app is broken right now (a runtime alert). */
  | {
      type: 'incident';
      project: Project;
      title: string;
      /** One free-form paragraph — a diagnosis that is genuinely one thought, not several findings glued by newlines. */
      detail?: string;
      /**
       * Several INDEPENDENT findings (a self-check emitting up to three
       * unrelated diagnostic lines, each starting with its own marker word
       * — `BAD`, `STALE`, `DIVERGED`) go here, not into `detail`: a list
       * squeezed into one blockquote read as a wall of text with no
       * category, the marker words doing a label's job inside a value.
       */
      items?: Item[];
      /** A local path to the logs (not a URL — renders monospaced, to copy, not to click). */
      logs?: string;
      url?: string;
      /**
       * The rest of this block arrived with the `session` type, which was
       * folded into `incident` on 03.09.2026. Two types said one thing —
       * something is stuck and waits for you — under the same 🚨, and the
       * owner cut it to one. The fields are not session-only in meaning: a
       * stuck deploy has a working directory too, and any alarm can carry a
       * command that gets you out of it.
       */
      /**
       * WHERE it burns, one word, printed in the bracket on the type word:
       * `Incident (Vault):`, `Incident (Session):`. The owner (03.09.2026):
       * the bracket should throw the place at the eye before anything is
       * read. Not an outcome — an incident has one — so this is the one
       * bracket that names a place. Absent → the project name, capitalised.
       */
      scope?: string;
      /** Which working copy this is about, when several of them look alike. */
      workdir?: string;
      /** One line of measurement: what the guard saw. */
      reason?: string;
      /**
       * A long quotation of someone's own writing — the line he opened a
       * session with. Quoted, never a field: a field would clip it to one
       * short line, which is exactly how the first version of that card lost
       * it.
       */
      opened?: string;
      /** A command for him to run, monospaced so Telegram makes it copyable. */
      command?: string;
      /** WHAT that command does — see the note on `job.commandNote`. */
      commandNote?: string;
    }
  /**
   * DEPRECATED since 1.16.0: send an `incident`. The type is still ACCEPTED
   * and renders as one — the runaway guard on this Mac
   * (`context-runaway-notify.sh`) sends exactly this and must keep working —
   * but `#session` is never printed again: the card comes out `#incident`.
   * It was a separate type because a session has an id, a working directory
   * and the line he typed to open it; `incident` carries all three now.
   */
  | {
      type: 'session';
      project: Project;
      /** What happened. Line 2 builds the incident's name out of it: `burning the limit` → `Claude session is burning the limit`. */
      action: string;
      /** The session's own id. Never printed as a field — he cannot type it or search it; it only reaches the card inside the `command`'s `rm`. */
      id?: string;
      /** Working directory name, when several sessions opened with a similar line. */
      workdir?: string;
      /** One line of measurement: what the guard saw. */
      reason?: string;
      /**
       * The line he opened the session with. Quoted, never a field: it is his
       * own writing, it runs long, and a field would clip it to one short line
       * — which is exactly how the first version of this card lost it.
       */
      opened?: string;
      /** A command for him to run, monospaced so Telegram makes it copyable. */
      command?: string;
      /** WHAT that command does — see the note on `job.commandNote`. */
      commandNote?: string;
      /**
       * Kept for old senders and no longer read: an incident is an alarm by
       * definition, and no sender ever passed `ok` here — the runaway guard
       * only ever sends the bad news.
       */
      status?: 'fail' | 'ok';
    }
  /**
   * DEPRECATED since 1.4.2: use `job` with status `silent`. The type stays,
   * because the silence watchdog lives on the server and sends exactly this
   * one until it is redeployed — removing it means losing the silence card
   * exactly when it is needed. Do not add new calls.
   */
  | {
      type: 'heartbeat_miss';
      project: Project;
      job: string;
      lastSeen?: string;
      expected?: string;
      /** The task reported in again — same type, a green card instead of a red one, the key (for matching) does not change. */
      recovered?: boolean;
      /** A ready-made reason sentence. Without it there is no `Reason:` row at all — `lastSeen`/`expected` still print, under their own `Schedule` group. */
      note?: string;
    }
  );

export type EventType = NotifyEvent['type'];

/** Red = with sound. Everything else is silent. (There is no separate "incidents" topic any more — an incident is visible in the project's feed.) */
/**
 * The icon dictionary. Two laws, both set by the owner on 25.08.2026:
 *
 * 1. WITHIN one tag every word gets its own icon. There used to be exactly
 *    four icons for the whole package, and `Issue: opened` looked the same
 *    as `Issue: assigned`, while a task's three different kinds of trouble —
 *    fail, disabled, silent — were the same red circle.
 * 2. BETWEEN tags the same meaning looks the same. `fail` is 🔴 whether on a
 *    deploy, on CI, or on a task; "something new appeared" is 🆕 on a board
 *    task, on a PR, and on a file alike.
 *
 * And a third law that keeps the first two honest: the sound is a fixed
 * property of the icon. Not of the event, not of the status — of the icon.
 * While the sound was a separate rule, `🔴 PR: changes_requested` arrived
 * silent.
 */
export const ICON = {
  ok: '✅',        // passed, closed, done
  red: '🔴',       // broken
  alarm: '🚨',     // burning right now
  off: '🚫',       // switched off — it will not run until someone turns it back on
  unknown: '❓',   // did not report: alive or dead is unknown
  fresh: '🆕',     // something new appeared
  taken: '🙋',     // someone took it
  landed: '🎉',    // merged — the work is in
  discarded: '🗑️', // closed without reaching the result
  approved: '👍',  // a human approved it
  changes: '📝',   // a human wants edits — not a failure, and not loud
  info: 'ℹ️'       // a summary, for information
} as const;

/** The sound is a property of the icon, and of nothing else. */
export const LOUD: ReadonlySet<string> = new Set([ICON.red, ICON.alarm, ICON.off, ICON.unknown]);

export const PR_ICON: Record<Extract<NotifyEvent, { type: 'pr' }>['action'], string> = {
  opened: ICON.fresh,
  approved: ICON.approved,
  changes_requested: ICON.changes,
  merged: ICON.landed,
  closed: ICON.discarded
};

export const ISSUE_ICON: Record<Extract<NotifyEvent, { type: 'issue' }>['action'], string> = {
  opened: ICON.fresh,
  assigned: ICON.taken,
  closed: ICON.ok
};

const JOB_ICON: Record<Extract<NotifyEvent, { type: 'job' }>['status'], string> = {
  ok: ICON.ok,
  fail: ICON.red,
  disabled: ICON.off,
  silent: ICON.unknown
};

/** One place decides the card's icon — both the render and the sound take it from here. */
export const iconFor = (e: NotifyEvent): string => {
  switch (e.type) {
    case 'deploy':
    case 'ci':
      return e.status === 'ok' ? ICON.ok : ICON.red;
    case 'job':
      // `?? ICON.unknown`: an untyped `--json` payload can carry a status
      // outside the map, and an undefined icon printed the literal word
      // `undefined` at the head of line 2. Not knowing is itself a state the
      // package already has a word and a sound for.
      return JOB_ICON[e.status] ?? ICON.unknown;
    // A session IS an incident since 03.09.2026 — same icon, same sound, same
    // tag. It is listed separately only because the type name still exists.
    case 'session':
    case 'incident':
      return ICON.alarm;
    case 'heartbeat_miss':
      return e.recovered ? ICON.ok : ICON.unknown;
    case 'pr':
      return PR_ICON[e.action] ?? ICON.unknown;
    case 'issue':
      return ISSUE_ICON[e.action] ?? ICON.unknown;
    case 'report':
      return ICON.info;
  }
};

export const severity = (e: NotifyEvent): 'info' | 'error' => {
  // ONE law: the icon decides the sound. There is no second list of "which
  // events are bad" to keep in sync with the icons — keeping two lists is how
  // `🔴 PR: changes_requested` ended up arriving MUTED, the only red card in
  // the package that did not ring, because severity() looked at `status` and a
  // pull request has an `action`.
  return LOUD.has(iconFor(e)) ? 'error' : 'info';
};
