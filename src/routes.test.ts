/**
 * Covers what render.test.ts did not cover: WHERE an event goes, WITH SOUND
 * or not, and what the CLI does with a broken command. These exact three
 * places are what the audit on 27.07.2026 found — the render was checked,
 * but the route and the argument parsing were not.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { severity } from './events.ts';
import { ROUTES, targets } from './routes.ts';
import { notify } from './send.ts';

test('the event goes to the Ops tab of its own project, and only there', () => {
  const where = targets({ type: 'deploy', project: 'playhub', status: 'ok' });

  assert.equal(where.length, 1);
  assert.equal(where[0].chat, ROUTES.playhub.chat);
  assert.equal(where[0].thread, ROUTES.playhub.ops);
});

test('an unknown project does not crash the process, it gives an empty list of targets', () => {
  // @ts-expect-error — this checks exactly the untyped call: this is how a
  // typo arrives from bash, where there are no types.
  assert.deepEqual(targets({ type: 'deploy', project: 'плейхаб', status: 'ok' }), []);
});

test('red rings, green stays quiet', () => {
  const fail = targets({ type: 'deploy', project: 'arvent', status: 'fail' });
  const ok = targets({ type: 'deploy', project: 'arvent', status: 'ok' });

  assert.equal(fail[0].silent, false);
  assert.equal(ok[0].silent, true);
});

test('an incident and a silent task are red on their own, with no --status', () => {
  assert.equal(severity({ type: 'incident', project: 'one-q', title: 'Redis лёг' }), 'error');
  assert.equal(severity({ type: 'heartbeat_miss', project: 'one-q', job: 'Бэкап' }), 'error');
});

test('every project in ROUTES has its own forum — a shared chat would mean strangers see each other\'s events', () => {
  const chats = Object.values(ROUTES).map((f) => f.chat);

  assert.equal(new Set(chats).size, chats.length);
});

/**
 * Runs the CLI with no token: nothing will be sent, only the argument
 * parsing matters here. spawnSync, not execFileSync: the latter gives back
 * stderr only when the process crashed, and the whole point here is the
 * output of a process that MUST return 0.
 */
const runCli = (...args: string[]): { code: number; stderr: string; stdout: string } => {
  const res = spawnSync(process.execPath, [fileURLToPath(new URL('cli.ts', import.meta.url)), ...args], {
    encoding: 'utf-8',
    env: { ...process.env, OPS_BOT_TOKEN: '' }
  });

  return { code: res.status ?? -1, stderr: res.stderr, stdout: res.stdout };
};

test('a value that starts with two dashes arrives through the --flag=value form', () => {
  // A GitHub issue body very often opens with `---` (markdown front matter or a
  // horizontal rule). Passed as a separate argument it is read as a flag, the
  // command is rejected and the card is lost — silently, because this CLI
  // always exits 0. Callers must use the `=` form; this test is what stops the
  // separate-argument form coming back.
  const body = '---\ntitle: front matter\n---\nНастоящее тело.';

  const split = runCli('issue', '--project', 'mac-config', '--action', 'opened',
    '--number', '322', '--title', 'T', '--body', body, '--dry-run');
  assert.match(split.stderr, /failed:/, 'the split form must be an explicit error');
  assert.equal(split.stdout, '', 'a card must not render from a broken command');

  const joined = runCli('issue', '--project=mac-config', '--action=opened',
    '--number=322', '--title=T', `--body=${body}`, '--dry-run');
  assert.equal(joined.code, 0);
  assert.ok(joined.stdout.includes('Настоящее тело.'), 'the issue body was lost');
  assert.ok(joined.stdout.includes('title: front matter'), 'the start of the body was eaten');
});

test('--dry-run prints the card to stdout and sends nothing', () => {
  // stdout, not stderr: watchdogs read stderr for `sent|failed|skipped`, and a
  // card printed there would be read as a verdict.
  const { code, stdout, stderr } = runCli('job', '--project=vault', '--job=Self-check',
    '--status=fail', '--note=sops missing', '--dry-run');

  assert.equal(code, 0);
  assert.ok(stdout.startsWith('#job #self_check #fail\n🔴 <b>Job (Fail):</b> Self-check'), stdout);
  assert.doesNotMatch(stderr, /sent|skipped|failed/, 'a dry run must not give a verdict');
});

test('--via and --took reach the job card', () => {
  // `--took` fills `duration`: the flag is the sender's word for the question,
  // the field is the card's.
  const { code, stdout } = runCli('job', '--project=mac-config', '--job=config sync',
    '--status=fail', '--via=mac', '--took=4m 12s', '--note=symlink missing', '--dry-run');

  assert.equal(code, 0);
  assert.ok(stdout.includes('<b>Job (Fail):</b> config sync'), stdout);
  assert.ok(stdout.includes('<b>Via:</b> Mac'), stdout);
  assert.ok(stdout.includes('<b>Took:</b> 4m 12s'), stdout);
});

// `notify session` is an alias of `notify incident` since 03.09.2026. The
// runaway guard on this Mac calls it and must keep working; what it sends now
// comes out as an incident, tag included.
test('notify session is an alias of notify incident', () => {
  const { code, stdout } = runCli('session', '--project=mac-config', '--key=context-runaway',
    '--action=burning the limit', '--workdir=arvent', '--reason=context 871596',
    '--opened=fix the login form', '--command=rm /tmp/x.latch',
    '--command-note=unlock it', '--dry-run');

  assert.equal(code, 0);
  assert.ok(stdout.includes('#incident #context_runaway #fail'), stdout);
  assert.ok(stdout.includes('🚨 <b>Incident:</b> Claude session is burning the limit'), stdout);
  assert.ok(!stdout.includes('#session'), 'the retired #session tag came back');
  assert.ok(stdout.includes('<b>Project:</b> arvent'), stdout);
  assert.ok(stdout.includes('<code>rm /tmp/x.latch</code>'), stdout);
});

test('a flag with no value is an explicit error, not href="true"', () => {
  const { code, stderr } = runCli('deploy', '--project', 'playhub', '--status', 'ok', '--url');

  assert.equal(code, 0);
  assert.match(stderr, /--url with no value/);
  // `failed` is what the Action and the VPS watchdog match on; `sent` must not
  // appear, or heartbeat-check.sh reads this failure as a success.
  assert.match(stderr, /failed:/);
  assert.ok(!/sent/.test(stderr), 'the word sent in a refusal — the watchdog would read it as a success');
  // And nothing was sent out: it never got to the sending step, so there is neither sent nor skipped.
  assert.doesNotMatch(stderr, /skipped/);
});

test('with no token the CLI gives back skipped and code 0 — a task must not crash because of a notification', () => {
  const { code, stderr } = runCli('job', '--project', 'playhub', '--job', 'тест', '--status', 'ok');

  assert.equal(code, 0);
  assert.match(stderr, /skipped/);
});

test('--status success must not draw red: a typo made by hand', () => {
  const { stderr } = runCli('deploy', '--project', 'playhub', '--status', 'success');

  // There is no token, so it becomes skipped afterward — but the event WAS
  // BUILT, it did not fall over during parsing: so `success` is recognized as
  // a success just like `ok`.
  assert.match(stderr, /skipped/);
  assert.doesNotMatch(stderr, /без значения/);
});

test('a prototype\'s own property names do not pass the project guard', async () => {
  // `in` walked the prototype chain: --project toString lost the event AND the card.
  const res = await notify({ type: 'job', project: 'toString', job: 'x', status: 'ok' } as never);

  assert.equal(res, 'skipped');
});


// Three paths where the CLI used to exit with code 0 and NOT say a single
// word from the `sent|failed|skipped` contract. Each one meant the same
// thing for the owner: there is no card, and the task that called it thinks
// everything is fine.
test('a typo in a flag name — a refusal, not a card with a missing field', () => {
  const { code, stderr } = runCli('job', '--project=playhub', '--job=x', '--status=fail', '--noto=missed');

  assert.equal(code, 0);
  assert.match(stderr, /unknown flag --noto/);
  assert.match(stderr, /failed:/);
  assert.ok(!/sent/.test(stderr), 'the word sent in a refusal — the watchdog would read it as a success');
});

test('an unknown event type — a refusal, not silence', () => {
  const { code, stderr } = runCli('jib', '--project=playhub', '--status=fail');

  assert.equal(code, 0);
  assert.match(stderr, /unknown event type: jib/);
  assert.match(stderr, /failed:/);
});

test('every flag name the code reads is declared in KNOWN_FLAGS', async () => {
  // A guard against drift: the list of known flags is the only thing that
  // tells a typo apart from a new field, and it must not drift apart from the code silently.
  const src = readFileSync(new URL('./cli.ts', import.meta.url), 'utf-8');
  const used = new Set(
    [...src.matchAll(/(?:one|num|pairs)\('([a-z-]+)'\)/g)].map((m) => m[1])
  );
  used.add('item');
  const { KNOWN_FLAGS } = await import('./cli-flags.ts');
  const missing = [...used].filter((f) => !KNOWN_FLAGS.has(f));

  assert.deepEqual(missing, [], `these flags are read but not declared: ${missing.join(', ')}`);
});

test('a parsing error does not give back the contract word out of the input', () => {
  // Other programs read `sent`, `failed`, `skipped`: notify-fail.sh greps for
  // `^[notify] sent$`, and the server's silence watchdog matches `*sent*`.
  // The call `notify sent --project=x` used to print `unknown event type:
  // sent`, and the watchdog read the undelivered card as delivered, and then
  // stopped repeating the alarm. Found by Codex on 25.08.2026.
  const res = runCli('sent', '--project=playhub', '--status=fail');

  assert.ok(res.stderr.includes('failed:'), 'a failure must name itself as a failure');
  assert.ok(!/\bsent\b/.test(res.stderr), `the contract word came back out of the input: ${res.stderr}`);
  assert.match(res.stderr, /event type: s.ent/, 'the event name must stay recognizable');
});
