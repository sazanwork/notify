/**
 * The v2.1 delivery guarantees: repeat suppression that can never swallow a
 * NEW failure, and a watchdog whose own card provably passes the lint —
 * the v1 watchdog did not, which is how it complained daily about others
 * while breaking the same standard itself.
 *
 * No network anywhere: `dedupe` and `brokenCardEvent` are pure against a
 * state file, and the state file lives in a per-test temp directory via
 * NOTIFY_STATE.
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import type { NotifyEvent } from './events.ts';
import { render } from './render.ts';
import { lintCard } from './lint.ts';
import { brokenCardEvent, brokenSlot, dedupe, forgetBroken, healedCardEvent, rememberBroken } from './send.ts';

const H = 3600_000;
const fail = (key: string, project = 'playhub' as const): NotifyEvent => ({
  type: 'job',
  project,
  job: 'Server backups',
  status: 'fail',
  note: 'scp: connection timed out',
  check: 'config jobs --log vps-backups',
  key
});

const ok = (key: string): NotifyEvent => ({
  type: 'job',
  project: 'playhub',
  job: 'Server backups',
  status: 'ok',
  check: 'config jobs --log vps-backups',
  key
});

let statePath = '';

beforeEach(() => {
  statePath = join(mkdtempSync(join(tmpdir(), 'notify-test-')), 'sent.json');
  process.env.NOTIFY_STATE = statePath;
});

test('dedupe: the first failure sends, the repeat inside the window is suppressed', () => {
  const t0 = Date.parse('2026-08-31T12:00:00Z');

  assert.equal(dedupe(fail('backups'), t0).action, 'send');
  assert.equal(dedupe(fail('backups'), t0 + 2 * H).action, 'suppress');
});

test('dedupe: past the window one card a day goes out and carries the day counter', () => {
  const t0 = Date.parse('2026-08-31T12:00:00Z');

  dedupe(fail('backups'), t0);
  const day2 = dedupe(fail('backups'), t0 + 24 * H);

  assert.equal(day2.action, 'send');
  assert.equal(day2.stillRed, 2);

  // Suppressed again inside the fresh window, then day 3.
  assert.equal(dedupe(fail('backups'), t0 + 25 * H).action, 'suppress');
  const day3 = dedupe(fail('backups'), t0 + 48 * H);

  assert.equal(day3.action, 'send');
  assert.equal(day3.stillRed, 3);
});

test('dedupe: a green outcome clears the record — recovery is told and a new failure starts at day one', () => {
  const t0 = Date.parse('2026-08-31T12:00:00Z');

  dedupe(fail('backups'), t0);
  assert.equal(dedupe(ok('backups'), t0 + 2 * H).action, 'send');
  // The next failure is a NEW failure: sent, no inherited day counter.
  const fresh = dedupe(fail('backups'), t0 + 3 * H);

  assert.equal(fresh.action, 'send');
  assert.equal(fresh.stillRed, undefined);
});

test('dedupe: a different instance is a different key — one target cannot silence another', () => {
  const t0 = Date.parse('2026-08-31T12:00:00Z');

  dedupe(fail('backups-host-a'), t0);
  assert.equal(dedupe(fail('backups-host-b'), t0 + 1 * H).action, 'send');
});

test('dedupe: non-fail outcomes are never suppressed', () => {
  const t0 = Date.parse('2026-08-31T12:00:00Z');

  assert.equal(dedupe(ok('daily'), t0).action, 'send');
  assert.equal(dedupe(ok('daily'), t0 + 1 * H).action, 'send');
});

test('dedupe: a broken state file fails OPEN — the card is sent, then the state heals', () => {
  writeFileSync(statePath, 'not json at all{{{');
  const t0 = Date.parse('2026-08-31T12:00:00Z');

  assert.equal(dedupe(fail('backups'), t0).action, 'send');
  // The state was rewritten clean and works again.
  assert.equal(dedupe(fail('backups'), t0 + 1 * H).action, 'suppress');
  assert.doesNotThrow(() => JSON.parse(readFileSync(statePath, 'utf-8')));
});

test('dedupe: an unreachable state directory fails OPEN', () => {
  process.env.NOTIFY_STATE = '/dev/null/impossible/sent.json';
  assert.equal(dedupe(fail('backups')).action, 'send');
});

test('watchdog: its own card passes the lint it enforces, even over a Russian-speaking offender', () => {
  // The offender writes system text in Russian — so the fault MESSAGE quotes
  // Russian, which is what used to fail the watchdog's own lint.
  const russian = render({
    type: 'job', project: 'os-config', job: 'GitHub board sync',
    status: 'fail', note: 'сеть не отвечает'
  });
  const russianFaults = lintCard(russian);

  assert.ok(russianFaults.length > 0, 'the Russian offender must be at fault for this test to prove anything');
  assert.deepEqual(
    lintCard(render(brokenCardEvent({ type: 'job', project: 'os-config', job: 'x', status: 'fail' }, russianFaults, russian))),
    [],
    'the watchdog broke its own standard reporting a Russian offender'
  );

  const offender = render({
    type: 'job',
    project: 'os-config',
    job: 'unattended job stopped reporting',
    status: 'fail',
    note: 'no log, no command and no link'
  });
  const faults = lintCard(offender);

  assert.ok(faults.length > 0, 'the offender must actually be at fault for this test to prove anything');

  const html = render(brokenCardEvent({ type: 'job', project: 'os-config', job: 'x', status: 'fail' }, faults, offender));

  assert.deepEqual(lintCard(html), [], `the watchdog card breaks its own standard:\n${html}`);
  assert.ok(html.includes('<b>Offender:</b>'), 'the watchdog must name the offender');
  assert.ok(html.includes('unattended job stopped reporting'), 'the offender is quoted by its own lines');
  assert.ok(html.includes('<b>Check:</b> <code>config jobs --log notify-broken</code>'), 'the Check command is real');
});

test('still red: the counter renders as its own row', () => {
  const html = render({ ...fail('backups'), stillRed: 3 });

  assert.ok(html.includes('<b>Still red:</b> day 3'), html);
  assert.deepEqual(lintCard(html), []);
});

// --- the watchdog keys by offender and heals its own red (15.09.2026) ---

const offender = (project: 'playhub' | 'htmlg', job: string): NotifyEvent => ({
  type: 'job',
  project,
  job,
  status: 'fail',
  check: 'config jobs'
});

test('watchdog: the slot names the offender — two scripts of one type never share a red', () => {
  assert.equal(brokenSlot(offender('playhub', 'Server backups')), 'notify-broken-job-playhub-server_backups');
  assert.notEqual(brokenSlot(offender('playhub', 'Server backups')), brokenSlot(offender('playhub', 'Weekly report')));
  assert.notEqual(brokenSlot(offender('playhub', 'Server backups')), brokenSlot(offender('htmlg', 'Server backups')));
  // the red card carries that slot as its key, so the green below pairs with it
  const red = brokenCardEvent(offender('playhub', 'Server backups'), ['x'], '#job #x #fail\nline');
  assert.equal(red.key, 'notify-broken-job-playhub-server_backups');
});

test('watchdog: a remembered offender is forgotten once, and only that offender', () => {
  const a = brokenSlot(offender('playhub', 'Server backups'));
  const b = brokenSlot(offender('playhub', 'Weekly report'));
  rememberBroken(a);
  assert.equal(forgetBroken(b), false, 'a clean card of ANOTHER script must not heal this red');
  assert.equal(forgetBroken(a), true);
  assert.equal(forgetBroken(a), false, 'the second clean run is silence');
  // the memory lives next to NOTIFY_STATE, never in the live ~/.claude/.runs
  assert.ok(readFileSync(join(dirname(statePath), 'notify-broken.red.json'), 'utf8').includes('{}'));
});

test('watchdog: the green pairs with the red — same key, same project, and passes the lint', () => {
  const e = offender('playhub', 'Server backups');
  const red = brokenCardEvent(e, ['x'], '#job #x #fail\nline');
  const green = healedCardEvent(e);
  assert.equal(green.key, red.key);
  assert.equal(green.project, red.project);
  assert.equal(green.type, 'job');
  assert.deepEqual(lintCard(render(green)), []);
  assert.ok(render(green).startsWith('#job #notify_broken_job_playhub_server_backups #ok'));
});
