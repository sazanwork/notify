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
export type Project = 'playhub' | 'one-q' | 'arvent' | 'game-publisher' | 'vault' | 'mac-config' | 'alitools';

/**
 * A stable machine key for the task — the last line of every card, shaped
 * as `#key` (with no project name: the card already sits in its own
 * project's forum — `targets()` never sends it to someone else's). The
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
 * separate `file` type since 25.08.2026 — an Arvent run used to send the
 * verdict and the log as two cards about one piece of news.
 */
type Keyed = {
  key?: string;
  /** A local file; the card goes out as its caption (caption limit 1024). */
  path?: string;
  /** The file's name in the chat; defaults to the name from `path`. */
  filename?: string;
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
export type Item = { text: string; url?: string; label?: string; group?: string };

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
      /** The commit's title — renders as the `Title:` field, the body follows as a quote. */
      commitTitle?: string;
      /** The commit's body, if there is one — the same quote shape as the title. */
      commitBody?: string;
      workflowUrl?: string;
      /** The run's name, for the link's visible text (defaults to `open`). */
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
       * The one qualifier the name needs to be readable on its own, printed in
       * brackets right after it: `Yandex game import (reporting again)`. It is
       * the same slot a report uses for the day it covers. Anything that is a
       * FACT about the job goes in a row of its own; this is for the word that
       * finishes the name.
       */
      aside?: string;
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
       */
      logs?: string;
      workflowUrl?: string;
      /** The run's name, for the link's visible text (defaults to `open`). */
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
      /** Empty/not passed when `groups` is used — the two kinds of report are not mixed in one event. */
      lines?: Array<[label: string, value: string | number, group?: string]>;
      /**
       * A list of items with links — for task digests, where the value is
       * in the names themselves, not in a number. Renders as a separate
       * block after `lines`.
       */
      items?: Item[];
      /**
       * Named groups (a task board: Ready/In Progress/Not on the board;
       * analytics: Metrics/Links) — each with its own heading and list of
       * items. Replaces `lines`/`items` when set: different reports use
       * either the flat form or groups, never both at once.
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
      /** The commit's title (subject) — a separate `Title:` field, not a quote. */
      commitTitle?: string;
      /** The commit's body (after the subject) — the same quote shape as the title. */
      commitBody?: string;
      actor?: string;
      /**
       * Why this run happened, when there is no commit to point at: a nightly
       * schedule, a manual press. Renders as `Reason:`, same as on deploy.
       */
      note?: string;
      /** A link to the run (workflow run) — separate from `url`, a fallback for `workflowUrl`. */
      workflowUrl?: string;
      /** The run's name, for the link's visible text (defaults to `open`). */
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
      /** PR description — quoted on its own; the title is the `Title:` field above it. */
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
      /** The issue's body — a quote under the `Title:` field, separate from the title. */
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
      detail?: string;
      /** A local path to the logs (not a URL — renders monospaced, to copy, not to click). */
      logs?: string;
      url?: string;
    }
  /**
   * A working session on this Mac is in trouble — not a job, not a workflow.
   * It went out as `job` at first and read wrong: `#job` promises something
   * scheduled that ran and failed, and the owner rightly asked what a burning
   * session was doing under that heading.
   *
   * What makes it its own type rather than an `incident`: a session has an
   * identity nothing else here has — an id, a working directory, and the line
   * he typed to start it, which is the ONLY thing that tells two of his open
   * sessions apart.
   */
  | {
      type: 'session';
      project: Project;
      /** What happened, as the second line reads it: `Session: burning the limit`. */
      action: string;
      /** The session's own id — the identifier field, first, as everywhere else. */
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
      /** `fail` red, `ok` green — a session that recovered is not an alarm. */
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
      /** A ready-made reason sentence; without it, one is built from lastSeen/expected. */
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
      return JOB_ICON[e.status];
    case 'session':
      return e.status === 'ok' ? ICON.ok : ICON.alarm;
    case 'incident':
      return ICON.alarm;
    case 'heartbeat_miss':
      return e.recovered ? ICON.ok : ICON.unknown;
    case 'pr':
      return PR_ICON[e.action];
    case 'issue':
      return ISSUE_ICON[e.action];
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
