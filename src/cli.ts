#!/usr/bin/env node
/**
 * `notify <type> [--flag value]...` — a thin dispatcher. Zero dependencies:
 * argument parsing is written by hand (not yargs/commander), because it
 * needs exactly two kinds of flags (a single one and a repeatable
 * `key=value`).
 *
 * The exit code is ALWAYS 0 — a notification has no right to bring down the
 * deploy or task that called it. All errors go to stderr only. There is
 * deliberately no exception (see docs/rollout.md "what we don't do"): there
 * is no scenario where a deploy should fail because a message did not send.
 *
 *   notify deploy   --project playhub --status ok --commit "msg" [--commit-url "..."] --url "..."
 *   notify job      --project playhub --job "Game import" --status ok --stat "added=5" [--via vps] [--took "4m 12s"]
 *   notify report   --project playhub --title "Daily summary" --line "Games=1284"
 *   notify ci       --project arvent  --status fail --branch master --actor saz_sam
 *   notify pr       --project arvent  --action opened --number 142 --title "..."
 *   notify incident --project arvent  --title "Redis is unreachable" --detail "$ERR"
 *   notify file     --project arvent  --title "Full dialogues" --path ./out.txt [--filename name.txt]
 *   notify <type> [--key stable-key]   # the task's key on the card's last line
 *   notify <type> --json < payload.json   # the whole event object on stdin
 *   notify setup <forum chat_id> <project key>   # create the tabs, see setup.ts
 */
import { readFileSync } from 'node:fs';
import type { NotifyEvent, Project } from './events.ts';
import { KNOWN_FLAGS } from './cli-flags.ts';
import { render } from './render.ts';
import { lintCard } from './lint.ts';
import { notify } from './send.ts';
import { ROUTES } from './routes.ts';
import { setupTopic } from './setup.ts';

const log = (msg: string): void => console.error(`[notify] ${msg}`);

/**
 * Anything taken from the caller and echoed into a message goes through this.
 *
 * `sent`, `failed` and `skipped` are a CONTRACT: `notify-fail.sh` greps
 * `^\[notify\] sent$`, the server-side silence watchdog matches `*sent*`, and
 * `action.yml` warns on `*failed*|*skipped*`. An input value carrying one of
 * those words puts it on stderr — `notify sent --project=x` printed
 * `unknown event type: sent`, and the watchdog read a card that was never
 * delivered as delivered, then stopped repeating the alarm. Found by Codex,
 * 25.08.2026.
 */
const safe = (v: unknown): string =>
  String(v ?? '').replace(/\b(sent|failed|skipped)\b/gi, (w) => `${w[0]}·${w.slice(1)}`);

const args = process.argv.slice(2);
const command = args[0];

// `lint-text` and `routes` exist so the nightly audit asks the PACKAGE
// instead of keeping its own copy of the rules and the routing table — the
// copies had already drifted twice.
if (command === 'lint-text') {
  // The finished card HTML on stdin; every fault on stdout, one per line.
  // Empty output means the card obeys the standard. Exit code stays 0 —
  // the CLI-wide contract.
  const text = readFileSync(0, 'utf-8').replace(/\n$/, '');
  for (const fault of lintCard(text)) {
    process.stdout.write(`${fault}\n`);
  }
  process.exit(0);
}

if (command === 'routes') {
  process.stdout.write(`${JSON.stringify(ROUTES, null, 2)}\n`);
  process.exit(0);
}

if (command === 'setup') {
  const [, chatId, projectKey] = args;

  if (!chatId || !projectKey) {
    log('usage: notify setup <forum chat_id> <project key>');
    log('  create the group first, turn Topics on in it, add the bot as admin');
    process.exit(0);
  }

  await setupTopic(chatId, projectKey);
  process.exit(0);
}

const flags = new Map<string, string[]>();
const parseErrors: string[] = [];

/** Flags with no value. Everything else must have one. */
const BOOLEAN_FLAGS = new Set(['json', 'recovered', 'dry-run']);

for (let i = 1; i < args.length; i++) {
  const arg = args[i];

  if (!arg.startsWith('--')) {
    parseErrors.push(`stray argument with no flag: "${safe(arg)}"`);
    continue;
  }

  // The `--key=value` form is required for values that start with `--`
  // (an error message, a diff chunk): otherwise they would get eaten as flags.
  const eq = arg.indexOf('=');

  if (eq !== -1) {
    const key = arg.slice(2, eq);
    flags.set(key, [...(flags.get(key) ?? []), arg.slice(eq + 1)]);
    continue;
  }

  const key = arg.slice(2);

  if (BOOLEAN_FLAGS.has(key)) {
    flags.set(key, ['true']);
    continue;
  }

  const next = args[i + 1];

  // A flag with no value used to silently become the string 'true'. That is
  // how `--url` at the end of a command produced `href="true"`, Telegram
  // answered 400 and THE WHOLE MESSAGE WAS LOST, and `--status` with no value
  // painted 🔴 on a successful deploy. Now it is an explicit parse error.
  if (next === undefined || next.startsWith('--')) {
    parseErrors.push(`flag --${safe(key)} with no value`);
    continue;
  }

  i++;
  flags.set(key, [...(flags.get(key) ?? []), next]);
}


const one = (key: string): string | undefined => flags.get(key)?.[0];

for (const key of flags.keys()) {
  if (!KNOWN_FLAGS.has(key)) {
    parseErrors.push(`unknown flag --${safe(key)}`);
  }
}

// A number with an explicit parse error, otherwise the render drew "PR #NaN".
const num = (key: string): number => {
  const raw = one(key);
  const n = Number(raw);

  if (raw === undefined || Number.isNaN(n)) {
    parseErrors.push(`--${safe(key)}: expected a number, got "${safe(raw)}"`);

    return 0;
  }

  return n;
};

/**
 * `--item "text"`, `--item "text|https://link"`, or, since 26.08.2026,
 * `--item "LABEL::text"` (and `LABEL::text|https://link`) for a bold label
 * in front of the row — the same shape a search query's `facts` render,
 * so a list of independent findings (vault's BAD/STALE/DIVERGED lines) does
 * not have to smuggle its own heading inside the text. `::` and not `|`,
 * which the link already owns, and not `:`, which shows up inside real
 * findings ("STALE IN ARCHIVE: ssh-keys.tar.gz.age" already has one).
 *
 * An item's group name cannot be passed the same way `--stat` does it: the
 * bar here is already taken by the link. So `--item-group "Red checks"` is
 * one name for all the items in this call. Senders' lists are homogeneous
 * (red checks, disabled processes), and a mixed list is what `--json` is
 * for.
 */
const items = (): Array<{ text: string; url?: string; group?: string; label?: string }> => {
  const name = flags.get('item-group')?.[0];

  return (flags.get('item') ?? []).map((raw) => {
    const labelEnd = raw.indexOf('::');
    const label = labelEnd === -1 ? undefined : raw.slice(0, labelEnd);
    const rest = labelEnd === -1 ? raw : raw.slice(labelEnd + 2);

    const idx = rest.lastIndexOf('|');
    const base =
      idx === -1 ? { text: rest } : { text: rest.slice(0, idx), url: rest.slice(idx + 1) };

    return { ...base, ...(label ? { label } : {}), ...(name ? { group: name } : {}) };
  });
};
/**
 * `--stat "label=value"`, and since 25.08.2026 — `--stat "Group | label=value"`:
 * group name, vertical bar, label. The bar was chosen because it appears in
 * no live label, while a colon does ("Eval: bot answer quality") and equals
 * is taken by the value. Spaces around the bar are optional.
 *
 * Without the bar everything works as before — over twenty senders send it
 * that way, and not one of them needs to change.
 */
const pairs = (key: string): Array<[string, string, string?]> =>
  (flags.get(key) ?? []).map((s) => {
    const idx = s.indexOf('=');
    const head = idx === -1 ? s : s.slice(0, idx);
    const value = idx === -1 ? '' : s.slice(idx + 1);
    const bar = head.indexOf('|');

    return bar === -1
      ? ([head, value] as [string, string, string?])
      : ([head.slice(bar + 1).trim(), value, head.slice(0, bar).trim()] as [string, string, string?]);
  });

const project = (): Project => one('project') as Project;

/**
 * GitHub calls actions by its own words, and one of our events is built from
 * two of its different events: `pull_request` (opened/closed/…) and
 * `pull_request_review` (submitted + state). So we accept both GitHub's raw
 * names and our own.
 *
 * An unknown action is an ERROR, not "close enough to opened." A silent
 * substitution would mean "changes requested" arrives as "opened," and the
 * owner would see something other than what happened — and this is exactly
 * the feed he uses to follow the team's work.
 */
type PrAction = Extract<NotifyEvent, { type: 'pr' }>['action'];
type IssueAction = Extract<NotifyEvent, { type: 'issue' }>['action'];

const PR_ALIASES: Record<string, PrAction> = {
  opened: 'opened',
  reopened: 'opened',
  // A PR that is already announced is not announced again: both of these mean
  // "this PR now wants eyes", which is what `opened` already says.
  ready_for_review: 'opened',
  review_requested: 'opened',
  approved: 'approved',
  changes_requested: 'changes_requested',
  merged: 'merged',
  closed: 'closed'
};

const ISSUE_ALIASES: Record<string, IssueAction> = {
  opened: 'opened',
  reopened: 'opened',
  assigned: 'assigned',
  closed: 'closed'
};

// The error goes into parseErrors — the same path the rest of parsing takes:
// below, it prints all the errors together and exits BEFORE sending. The
// placeholder value only needs to satisfy the type; it never lives to reach
// the network.
const prAction = (raw: string | undefined): PrAction => {
  const hit = PR_ALIASES[(raw ?? '').toLowerCase()];

  if (!hit) {
    parseErrors.push(`--action: unknown PR action "${safe(raw)}" (${Object.keys(PR_ALIASES).join(', ')})`);

    return 'opened';
  }

  return hit;
};

const issueAction = (raw: string | undefined): IssueAction => {
  const hit = ISSUE_ALIASES[(raw ?? '').toLowerCase()];

  if (!hit) {
    parseErrors.push(
      `--action: unknown issue action "${raw ?? ''}" (${Object.keys(ISSUE_ALIASES).join(', ')})`
    );

    return 'opened';
  }

  return hit;
};

/**
 * Anything not recognized as a success counts as a failure.
 *
 * What matters here is not strictness but consistency: `--status success`
 * used to (a natural typo on a manual call) paint 🔴 "failed," but
 * `severity()` saw "not fail" and sent the message WITH NO SOUND. A red
 * card with no sound is the worst outcome: it looks like an incident but
 * does not wake anyone up.
 */
const status = (): 'ok' | 'fail' => {
  const raw = (one('status') ?? '').toLowerCase();

  return raw === 'ok' || raw === 'success' || raw === 'passed' || raw === '0' ? 'ok' : 'fail';
};

// `job` is the only type with a third state (`disabled`): the task did not
// fail on its own, someone switched it off from outside (GitHub Actions out
// of minutes).
const jobStatus = (): 'ok' | 'fail' | 'disabled' | 'silent' => {
  const raw = (one('status') ?? '').toLowerCase();

  if (raw === 'disabled') {
    return 'disabled';
  }

  if (raw === 'silent') {
    return 'silent';
  }

  return raw === 'ok' || raw === 'success' || raw === 'passed' || raw === '0' ? 'ok' : 'fail';
};

let event: NotifyEvent | undefined;

if (flags.has('json')) {
  try {
    const payload = JSON.parse(readFileSync(0, 'utf-8')) as Record<string, unknown>;

    // type comes from the command, not from the payload: otherwise --pr
    // <object with type:deploy> would send an event of a different type.
    event = { ...payload, type: command } as NotifyEvent;
  } catch (err) {
    // Also into parseErrors: both analytics jobs call the CLI through
    // `|| true`, and a silent JSON parse failure would mean a green cron run
    // with no daily report.
    parseErrors.push(`--json from stdin did not parse: ${safe(err instanceof Error ? err.message : err)}`);
  }
} else {
  switch (command) {
    case 'deploy':
      event = {
        type: 'deploy',
        project: project(),
        status: status(),
        commit: one('commit'),
        commitUrl: one('commit-url'),
        commitTitle: one('commit-title'),
        commitBody: one('commit-body'),
        commitAuthor: one('commit-author'),
        workflowUrl: one('workflow-url'),
        workflowName: one('workflow-name'),
        url: one('url'),
        target: one('target'),
        via: one('via'),
        note: one('note')
      };
      break;
    case 'job':
      event = {
        type: 'job',
        project: project(),
        job: one('job') ?? '(no name)',
        status: jobStatus(),
        aside: one('aside'),
        // Where it ran and how long it took: `--via mac`, `--took '4m 12s'`.
        // `--took` fills `duration` — the flag is the sender's word for the
        // question ("how long did it take?"), the field is the card's.
        via: one('via'),
        duration: one('took'),
        expected: one('expected'),
        lastSeen: one('last-seen'),
        stats: pairs('stat'),
        items: items(),
        note: one('note'),
        command: one('command'),
        commandNote: one('command-note'),
        logs: one('logs'),
        detail: one('detail'),
        detailLabel: one('detail-label'),
        workflowUrl: one('workflow-url'),
        workflowName: one('workflow-name'),
        url: one('url')
      };
      break;
    case 'report':
      event = {
        type: 'report',
        project: project(),
        title: one('title') ?? '(no title)',
        // `--period` is the old spelling of `--aside`; both fill the same
        // slot, and two senders still use the old one.
        aside: one('aside') ?? one('period'),
        lines: pairs('line'),
        items: items(),
        url: one('url')
      };
      break;
    case 'ci':
      event = {
        type: 'ci',
        project: project(),
        status: status(),
        branch: one('branch'),
        commit: one('commit'),
        commitUrl: one('commit-url'),
        commitTitle: one('commit-title'),
        commitBody: one('commit-body'),
        commitAuthor: one('commit-author'),
        actor: one('actor'),
        note: one('note'),
        workflowUrl: one('workflow-url'),
        workflowName: one('workflow-name'),
        url: one('url')
      };
      break;
    case 'pr':
      event = {
        type: 'pr',
        project: project(),
        action: prAction(one('action')),
        number: num('number'),
        title: one('title') ?? '(no title)',
        body: one('body'),
        author: one('author'),
        reviewer: one('reviewer'),
        url: one('url')
      };
      break;
    case 'issue':
      event = {
        type: 'issue',
        project: project(),
        action: issueAction(one('action')),
        number: num('number'),
        title: one('title') ?? '(no title)',
        body: one('body'),
        author: one('author'),
        assignee: one('assignee'),
        url: one('url')
      };
      break;
    case 'session':
      event = {
        type: 'session',
        project: project(),
        action: one('action') ?? 'in trouble',
        id: one('id'),
        workdir: one('workdir'),
        reason: one('reason'),
        opened: one('opened'),
        command: one('command'),
        commandNote: one('command-note'),
        // Only two states here, so `disabled` must not leak in from jobStatus.
        status: jobStatus() === 'ok' ? 'ok' : 'fail'
      };
      break;
    case 'incident':
      event = {
        type: 'incident',
        project: project(),
        title: one('title') ?? '(no title)',
        detail: one('detail'),
        items: items(),
        logs: one('logs'),
        url: one('url')
      };
      break;
    case 'heartbeat_miss':
      event = {
        type: 'heartbeat_miss',
        project: project(),
        job: one('job') ?? '(no name)',
        lastSeen: one('last-seen'),
        expected: one('expected'),
        recovered: flags.has('recovered'),
        note: one('note')
      };
      break;
    // `file` is no longer a kind of event — an attachment is a property any
    // card may have. The word is kept as an alias so senders that still say
    // `notify file` deliver a report card with the log attached, instead of
    // falling into the unknown-type branch and going silent.
    case 'file':
      event = {
        type: 'report',
        project: project(),
        title: one('title') ?? '(no title)',
        aside: one('aside') ?? one('period'),
        lines: pairs('line'),
        items: items(),
        url: one('url')
      };
      break;
    default:
      // Into parseErrors, not just into the log: otherwise an unknown type
      // went quiet — no event was built, there were no parse errors, and
      // the CLI exited zero, sending nothing and saying nothing about it.
      parseErrors.push(`unknown event type: ${safe(command ?? '(none given)')}`);
  }
}

// --key applies to any type — one spot instead of a line in every case
// (nine copies would already have lost the tenth). `??`: the --json path
// may carry key in the object itself, a missing flag must not overwrite it.
if (event) {
  event.key = one('key') ?? event.key;
  // --path is applicable to any type too, for the same reason --key is.
  event.path = one('path') ?? event.path;
  event.filename = one('filename') ?? event.filename;
  // --check applies to any type (rule S): the verification command for a
  // card whose event has no canonical URL.
  event.check = one('check') ?? event.check;
}

if (event?.filename && !event.path) {
  parseErrors.push('--filename: given without --path, so there is no file to name');
}

// Parse errors — before sending: better to say clearly what is wrong with
// the command than to send a message with "true" instead of a link, or a
// 🔴 on a successful deploy.
if (parseErrors.length > 0) {
  for (const err of parseErrors) {
    log(err);
  }
  // The word `failed` is a CONTRACT, not prose. Two readers match on it: the
  // GitHub Action turns it into a yellow annotation, and the VPS watchdog reads
  // the combined stream for `sent|failed|skipped`. Before this, a parse error
  // printed neither word — the run stayed green, the watchdog stayed quiet, and
  // the card simply never existed.
  // It must NOT contain the substring `sent`: heartbeat-check.sh matches `*sent*`
  // and would read a failure as a success.
  log('failed: bad command, nothing delivered');
  process.exit(0);
}

if (event && flags.has('dry-run')) {
  // The rendered card on STDOUT, nothing sent and no token needed. This is how
  // a change to the format is shown to the owner before it reaches a forum, and
  // how ~25 edited call sites are checked one by one — the package always exits
  // 0, so a typo in a flag is otherwise silent.
  //
  // stdout, not stderr: every other line this CLI prints goes to stderr, and
  // watchdogs read that stream for the words `sent|failed|skipped`. A card
  // printed there would be read as a verdict.
  process.stdout.write(`${render(event)}\n`);
  process.exit(0);
}

if (event) {
  // Catches EVERYTHING: a notification has no right to bring down the
  // deploy or cron job that called it. In bash with `set -e` (or in
  // `trap ... ERR`) a non-zero code here would fail the task itself — the
  // exact thing this package must never do.
  try {
    log(await notify(event));
  } catch (err) {
    // The word `failed` is a contract, the same one the parse error above
    // uses. Without it, an exception while sending read to watchdogs as
    // "nothing happened."
    log(`failed: ${safe(err instanceof Error ? err.message : err)}`);
  }
}

process.exit(0);
