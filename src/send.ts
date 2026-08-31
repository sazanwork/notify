/**
 * Transport. Carries over the code proven in production from
 * game-publisher/scripts/lib/telegram.ts (fetch, with a curl fallback
 * through stdin, and `.trim()` on the token) and adds what that code did not
 * have: several targets per call, `message_thread_id`, a retry on HTTP 429
 * that respects `retry_after`, a retry on 5xx, and a refusal with no retry
 * on any other 4xx.
 *
 * The token comes ONLY from `process.env.OPS_BOT_TOKEN`, with `.trim()`: a
 * newline in the token (a common find after copy-paste) makes curl read the
 * config as two directives and leak the tail of the token into the run's
 * stderr.
 *
 * No token means 'skipped', not an exception: a notification must never be
 * allowed to bring down the deploy or the scheduled task that called it.
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync, renameSync, rmdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import type { NotifyEvent, Project } from './events.ts';
import { eventKey, outcomeTag, render } from './render.ts';
import { lintCard } from './lint.ts';
import type { Target } from './routes.ts';
import { ROUTES, targets } from './routes.ts';

export type SendResult = 'sent' | 'skipped' | 'failed';

const log = (msg: string): void => {
  // stderr, not stdout — stdout is reserved for possible machine output of the CLI.
  console.error(`[notify] ${msg}`);
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const buildBody = (target: Target, text: string): string =>
  JSON.stringify({
    chat_id: target.chat,
    ...(target.thread ? { message_thread_id: target.thread } : {}),
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    disable_notification: target.silent
  });

/**
 * Fallback path: curl uses a different TLS/DNS stack, and helps in places
 * where fetch/undici cannot route the request. The URL with the token goes
 * out as a config file through stdin, not as an argument: in argv it would
 * be visible to any user on the server through `ps aux`. stderr is set to
 * 'pipe', not inherited: a curl error message can contain a piece of the URL
 * with the token, and it must not end up in the run's log.
 */
const sendViaCurl = (token: string, target: Target, text: string): 'ok' | 'fail' | 'retry' => {
  const config = [
    `url = "https://api.telegram.org/bot${token}/sendMessage"`,
    'request = "POST"',
    'header = "Content-Type: application/json"',
    `data = ${JSON.stringify(buildBody(target, text))}`,
    'max-time = 15',
    'silent',
    'fail'
  ].join('\n');

  try {
    execFileSync('curl', ['--config', '-'], {
      input: config,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    return 'ok';
  } catch (err) {
    // 28 is curl's own timeout (the `max-time` set above). Like a fetch
    // timeout, it means "no answer came back", not "not delivered": a retry
    // would put a second copy in the chat. Everything else (connection
    // refused, 4xx with `fail`) is safe to retry.
    return (err as { status?: number }).status === 28 ? 'fail' : 'retry';
  }
};

type Attempt = { outcome: 'ok' } | { outcome: 'fail' } | { outcome: 'retry'; waitMs: number };

const attempt = async (token: string, target: Target, text: string): Promise<Attempt> => {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: buildBody(target, text),
      signal: AbortSignal.timeout(10_000)
    });

    if (res.ok) {
      return { outcome: 'ok' };
    }

    if (res.status === 429) {
      const body = (await res.json().catch(() => null)) as { parameters?: { retry_after?: number } } | null;
      const retryAfter = typeof body?.parameters?.retry_after === 'number' ? body.parameters.retry_after : 5;

      return { outcome: 'retry', waitMs: Math.min(retryAfter, 60) * 1000 };
    }

    if (res.status >= 500) {
      return { outcome: 'retry', waitMs: 1000 };
    }

    // A 4xx other than 429 is a permanent error (wrong thread, the bot is
    // not an admin, wrong chat_id). A retry will not fix it.
    //
    // We always pull out the reason: Telegram puts it in `description`
    // ("message thread not found", "can't parse entities"), and without it
    // there is no way to understand why notifications went missing — and the
    // one working it out will not be a developer, it will be the owner.
    const detail = (await res.json().catch(() => null)) as { description?: string } | null;

    log(`HTTP ${res.status}: ${detail?.description ?? 'no description'} — permanent error, not retried`);

    return { outcome: 'fail' };
  } catch (err) {
    // A timeout is NOT the same thing as "not delivered": the request may
    // have gone through, and only the answer failed to come back in time. A
    // retry (whether by curl or by the next attempt) puts a second copy of
    // the same message in the chat — the Bot API has no deduplication. So on
    // a timeout we stop and honestly write 'failed': an extra copy of an
    // alarm is worse than a missing line in the log, and the message most
    // likely went out anyway.
    if (err instanceof Error && err.name === 'TimeoutError') {
      log('answer timed out — not retried: the message may already be out');

      return { outcome: 'fail' };
    }

    // This branch catches connection failures (DNS, TLS, network
    // unreachable) — the request almost certainly did not go out, so the
    // curl fallback is safe. NOT absolutely safe: a break (reset or
    // truncation) AFTER Telegram already accepted the POST also throws an
    // exception here — then a retry produces a duplicate. This is a rare
    // case; a full guarantee against duplicates is not possible without an
    // idempotency key on the Bot API (it does not have one). The logic
    // stays the same: a duplicate on a rare reset is a smaller problem than
    // a lost message on a common network failure.
    log('fetch did not go through, trying curl…');

    const curl = sendViaCurl(token, target, text);

    return curl === 'retry' ? { outcome: 'retry', waitMs: 1000 } : { outcome: curl };
  }
};

const MAX_ATTEMPTS = 3;

const sendOne = async (token: string, target: Target, text: string): Promise<'sent' | 'failed'> => {
  let waitMs = 0;

  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    if (waitMs > 0) {
      await sleep(waitMs);
    }

    const result = await attempt(token, target, text);

    if (result.outcome === 'ok') {
      return 'sent';
    }

    if (result.outcome === 'fail') {
      return 'failed';
    }

    waitMs = result.waitMs;
  }

  log('out of send attempts');

  return 'failed';
};

/** The shared tail of `notify()`: token, targets, delivery one after another. */
const deliver = async (where: Target[], text: string): Promise<SendResult> => {
  const token = process.env.OPS_BOT_TOKEN?.trim();

  if (!token) {
    log('skipped: no OPS_BOT_TOKEN, the message was not sent');

    return 'skipped';
  }

  // The token is interpolated into the URL and into the curl config
  // (`url = "...bot${token}..."`). A valid Telegram token matches
  // `\d+:[\w-]+`; anything with a quote, a newline, or a `?` would break the
  // parsing (a curl directive injection or a query tail). This needs a
  // corrupted secret to happen, but the check is cheap.
  if (!/^\d+:[A-Za-z0-9_-]+$/.test(token)) {
    log('failed: OPS_BOT_TOKEN does not look like a Telegram token, send cancelled');

    return 'skipped';
  }

  if (where.length === 0) {
    return 'skipped';
  }

  const results: Array<'sent' | 'failed'> = [];

  // One after another, not Promise.all: a failure on one target must not run
  // its retries in parallel with the rest and hammer the API on several chats at once.
  for (const target of where) {
    results.push(await sendOne(token, target, text));
  }

  return results.includes('sent') ? 'sent' : 'failed';
};

/**
 * A file (sendDocument) is multipart, so it does not go through `buildBody`.
 * The retry policy is the same as for messages: 429 respects retry_after,
 * 5xx retries, any other 4xx or a timeout does not (a duplicate file is
 * worse than a missing one). There is no separate curl fallback here: the
 * file is sent from this same machine, not from CI, and a different TLS
 * stack has never been needed here.
 */
const sendFileOnce = async (
  token: string,
  target: Target,
  e: NotifyEvent & { path: string },
  caption: string
): Promise<Attempt> => {
  try {
    const form = new FormData();
    form.append('chat_id', target.chat);
    if (target.thread) {
      form.append('message_thread_id', String(target.thread));
    }
    form.append('caption', caption);
    form.append('parse_mode', 'HTML');
    form.append('disable_notification', String(target.silent));
    // readFileSync + Blob, not openAsBlob: that appeared in Node 19.8, and
    // this package also runs on the server. The files here are text reports, so memory is not a concern.
    form.append('document', new Blob([readFileSync(e.path)]), e.filename ?? basename(e.path));

    const res = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(60_000)
    });

    if (res.ok) {
      return { outcome: 'ok' };
    }
    if (res.status === 429) {
      const body = (await res.json().catch(() => null)) as { parameters?: { retry_after?: number } } | null;
      const retryAfter = typeof body?.parameters?.retry_after === 'number' ? body.parameters.retry_after : 5;

      return { outcome: 'retry', waitMs: Math.min(retryAfter, 60) * 1000 };
    }
    if (res.status >= 500) {
      return { outcome: 'retry', waitMs: 1000 };
    }

    const detail = (await res.json().catch(() => null)) as { description?: string } | null;
    log(`HTTP ${res.status}: ${detail?.description ?? 'no description'} — permanent error, not retried`);

    return { outcome: 'fail' };
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') {
      log('answer timed out — not retried: the file may already be out');

      return { outcome: 'fail' };
    }
    // The file cannot be read (not on disk, no permission) — a permanent error.
    if (err instanceof Error && 'code' in err) {
      log(`failed to send the file: ${err.message}`);

      return { outcome: 'fail' };
    }
    log(`the network refused the file: ${err instanceof Error ? err.message : String(err)}`);

    return { outcome: 'retry', waitMs: 1000 };
  }
};

const sendFile = async (e: NotifyEvent & { path: string }): Promise<SendResult> => {
  const token = process.env.OPS_BOT_TOKEN?.trim();

  if (!token || !/^\d+:[A-Za-z0-9_-]+$/.test(token)) {
    log('skipped: no valid OPS_BOT_TOKEN, the file was not sent');

    return 'skipped';
  }

  const where = targets(e);

  if (where.length === 0) {
    return 'skipped';
  }

  const caption = render(e);
  const results: Array<'sent' | 'failed'> = [];

  // The same contract as deliver: a failure on one target does not cancel the rest.
  for (const target of where) {
    let waitMs = 0;
    let got: 'sent' | 'failed' = 'failed';

    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      if (waitMs > 0) {
        await sleep(waitMs);
      }
      const result = await sendFileOnce(token, target, e, caption);

      if (result.outcome === 'ok') {
        got = 'sent';
        break;
      }
      if (result.outcome === 'fail') {
        break;
      }
      waitMs = result.waitMs;
    }
    results.push(got);
  }

  return results.includes('sent') ? 'sent' : 'failed';
};

/**
 * Repeat suppression (v2.1). A failure that is still the same failure does
 * not resend every run: the first card goes out, repeats inside the window
 * are swallowed, and past the window ONE card a day goes out carrying
 * `Still red: day N`. A green outcome clears the record — without that, a
 * new failure would inherit the old one's day counter and the recovery
 * itself would never be told.
 *
 * The key is project + type + instance — DELIBERATELY no free text: both
 * external reviews independently showed that normalizing prose (stripping
 * digits, hexes, paths) merges different failures — "connect to host A" and
 * "connect to host B" become one key and the second failure goes silent. A
 * job that covers several targets owes each target its own `--key`.
 *
 * Every failure of the mechanism itself fails OPEN: a broken state file, a
 * held lock, an unwritable directory all mean "send". A duplicate card is a
 * small cost; a swallowed alarm is not.
 */
const WINDOW_MS = 20 * 3600_000;
const DAY_MS = 24 * 3600_000;

type SentState = Record<string, { first: string; last: string; count: number }>;

const statePath = (): string =>
  process.env.NOTIFY_STATE?.trim() || join(homedir(), '.claude', '.runs', 'notify-sent.json');

/** Exported for tests only — the time is injectable so day counting is provable. */
export const dedupe = (e: NotifyEvent, now = Date.now()): { action: 'send' | 'suppress'; stillRed?: number } => {
  const file = statePath();
  const lock = `${file}.lock`;

  try {
    mkdirSync(dirname(file), { recursive: true });
    // The lock is a directory: mkdir is atomic on every filesystem this runs
    // on. A held lock means another sender is mid-write — fail open.
    mkdirSync(lock);
  } catch {
    return { action: 'send' };
  }

  try {
    let state: SentState = {};
    try {
      state = JSON.parse(readFileSync(file, 'utf-8')) as SentState;
    } catch {
      state = {}; // missing or broken JSON — start clean, never swallow
    }

    const key = `${String(e.project)}:${String(e.type)}:${eventKey(e)}`;
    const rec = state[key];

    const write = (): void => {
      const tmp = `${file}.tmp`;
      writeFileSync(tmp, JSON.stringify(state));
      renameSync(tmp, file);
    };

    if (outcomeTag(e) !== 'fail') {
      if (rec) {
        delete state[key];
        write();
      }

      return { action: 'send' };
    }

    if (!rec) {
      state[key] = { first: new Date(now).toISOString(), last: new Date(now).toISOString(), count: 0 };
      write();

      return { action: 'send' };
    }

    const last = Date.parse(rec.last);
    const first = Date.parse(rec.first);

    if (Number.isNaN(last) || Number.isNaN(first)) {
      delete state[key];
      write();

      return { action: 'send' };
    }

    if (now - last < WINDOW_MS) {
      rec.count += 1;
      write();
      log(`suppressed: same failure "${key}" already reported ${rec.count} time(s) in the window`);

      return { action: 'suppress' };
    }

    rec.last = new Date(now).toISOString();
    write();
    // Day 1 is the day the first card went out; the counter only appears
    // from day 2 on — "Still red: day 1" would restate the card itself.
    const day = Math.floor((now - first) / DAY_MS) + 1;

    return { action: 'send', ...(day >= 2 ? { stillRed: day } : {}) };
  } catch {
    return { action: 'send' };
  } finally {
    try {
      rmdirSync(lock);
    } catch {
      // the lock directory is gone or never ours — nothing to release
    }
  }
};

/**
 * Sends the event to all of its targets (the project topic, plus
 * `incidents` if needed, plus the team chat). Targets are handled one after
 * another; a failure on one does not cancel the rest. Returns `'sent'` if at
 * least one target got the message.
 *
 * An unknown project still does NOT bring down the scheduled task that
 * called it (the exit code does not change) — but it no longer disappears
 * silently either: a red card goes out to mac-config Ops. This kind of
 * failure lived unnoticed for weeks, twice: "vault" and "mac-config" until
 * 04.08, and the Alitools reports until 18.08. Recursion is not possible
 * here: the error card is addressed to mac-config, which is always present
 * in ROUTES.
 */
const reportLostProject = async (project: unknown, kind: string): Promise<void> => {
  // The local log also names the valid spellings — this is the only
  // diagnostic available on the machine where the typo happened.
  log(`unknown project "${String(project)}" — known: ${Object.keys(ROUTES).join(', ')}`);
  const lost: NotifyEvent = {
    type: 'job',
    project: 'mac-config',
    job: 'notify: an event was lost',
    status: 'fail',
    note: `project "${String(project)}" is not in ROUTES — event "${kind}" went nowhere`,
    check: 'npx --yes @mikitasazan/notify routes --json',
    key: 'notify-unknown-project'
  };

  await deliver(targets(lost), render(lost)).catch(() => undefined);
};

/**
 * The card broke the standard. It still goes out — a notification is never
 * worth losing over its own formatting — and the breach is raised as its own
 * red card, the way a lost project is.
 *
 * The watchdog card names the offender: the first two content lines of the
 * card it complains about, quoted verbatim under `Offender:` so the owner
 * can find it in the feed. Its `Check:` is a real command (the mockups'
 * `lint-text < card.txt` pointed at a file the owner does not have — a fake
 * pointer is worse than none), and the offender's full text goes to the
 * failure log the session start already reads.
 *
 * `key` carries the type, so a renderer that starts producing broken deploy
 * cards raises one running complaint rather than a new one every hour — and
 * the card passes through the same `dedupe` as any failure, so it cannot
 * loop daily on one unfixed offender.
 *
 * The watchdog lints ITSELF (v2.1 — the v1 card failed its own lint and
 * nothing noticed). If its own card is at fault it still goes out, and the
 * breach lands in the failure log: silence is the one thing it may not do.
 */
const failuresLog = (): string =>
  process.env.NOTIFY_FAILLOG?.trim() || join(homedir(), '.claude', '.runs', 'notify-fail.failures.log');

const journal = (line: string): void => {
  try {
    const file = failuresLog();
    mkdirSync(dirname(file), { recursive: true });
    appendFileSync(file, `${new Date().toISOString()} ${line}\n`);
  } catch {
    // the journal is best-effort: a card must never be lost to bookkeeping
  }
};

/** Exported for tests: the watchdog's own card must provably pass the lint. */
export const brokenCardEvent = (e: NotifyEvent, faults: string[], offenderHtml: string): NotifyEvent => {
  const offender = offenderHtml
    .split('\n')
    .slice(1) // the tag line names nothing a human reads
    .map((r) => r.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').trim())
    .filter((r) => r !== '')
    .slice(0, 2)
    .join('\n');

  return {
    type: 'job',
    project: 'mac-config',
    job: 'notify: a card broke the standard',
    status: 'fail',
    note: `${String(e.type)} card for ${String(e.project)}: ${faults.join('; ')}`,
    detail: offender || undefined,
    detailLabel: 'Offender',
    check: 'config jobs --log notify-broken',
    key: `notify-broken-${String(e.type)}`
  };
};

const reportBrokenCard = async (e: NotifyEvent, faults: string[], offenderHtml: string): Promise<void> => {
  log(`card does not match the standard: ${faults.join('; ')}`);
  const broken = brokenCardEvent(e, faults, offenderHtml);

  const dup = dedupe(broken);

  if (dup.action === 'suppress') {
    return;
  }
  if (dup.stillRed) {
    broken.stillRed = dup.stillRed;
  }

  const html = render(broken);
  const ownFaults = lintCard(html);

  if (ownFaults.length > 0) {
    journal(`notify-watchdog: own card failed lint: ${ownFaults.join('; ')}`);
  }

  await deliver(targets(broken), html).catch(() => undefined);
};

export const notify = async (e: NotifyEvent): Promise<SendResult> => {
  // Object.hasOwn, not `in`: `in` walks the prototype chain, and
  // --project toString/constructor would pass the guard, losing the event AND the card about the loss.
  if (!Object.hasOwn(ROUTES, e.project)) {
    await reportLostProject(e.project, String(e.type));

    return 'skipped';
  }

  // The same unresolved failure does not resend: the window swallows it, one
  // card a day carries `Still red: day N`. Suppression reports 'sent' to the
  // caller — the words sent/failed/skipped are a watchdog contract about the
  // delivery PIPELINE, and a deliberate swallow is the pipeline working.
  const dup = dedupe(e);

  if (dup.action === 'suppress') {
    return 'sent';
  }
  if (dup.stillRed) {
    e.stillRed = dup.stillRed;
  }

  // A card with a file becomes the caption of that file — one card, not two.
  if (e.path) {
    return sendFile(e as NotifyEvent & { path: string });
  }

  const html = render(e);
  // Send first, complain second: the delivery of the real card must not wait
  // on, or be lost to, a check about how it looks.
  const result = await deliver(targets(e), html);
  const faults = lintCard(html);

  if (faults.length > 0) {
    await reportBrokenCard(e, faults, html);
  }

  return result;
};

