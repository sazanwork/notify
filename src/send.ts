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
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import type { NotifyEvent, Project } from './events.ts';
import { clampMessage, render } from './render.ts';
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
    key: 'notify-unknown-project'
  };

  await deliver(targets(lost), render(lost)).catch(() => undefined);
};

/**
 * The card broke the standard. It still goes out — a notification is never
 * worth losing over its own formatting — and the breach is raised as its own
 * red card, the way a lost project is.
 *
 * `key` carries the type, so a renderer that starts producing broken deploy
 * cards raises one running complaint rather than a new one every hour.
 * Recursion is not possible: this card is not linted.
 */
const reportBrokenCard = async (e: NotifyEvent, faults: string[]): Promise<void> => {
  log(`card does not match the standard: ${faults.join('; ')}`);
  const broken: NotifyEvent = {
    type: 'job',
    project: 'mac-config',
    job: 'notify: a card broke the standard',
    status: 'fail',
    note: `${String(e.type)} card for ${String(e.project)}: ${faults.join('; ')}`,
    key: `notify-broken-${String(e.type)}`
  };

  await deliver(targets(broken), render(broken)).catch(() => undefined);
};

export const notify = async (e: NotifyEvent): Promise<SendResult> => {
  // Object.hasOwn, not `in`: `in` walks the prototype chain, and
  // --project toString/constructor would pass the guard, losing the event AND the card about the loss.
  if (!Object.hasOwn(ROUTES, e.project)) {
    await reportLostProject(e.project, String(e.type));

    return 'skipped';
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
    await reportBrokenCard(e, faults);
  }

  return result;
};

