/**
 * One test for the whole package: for every event type it checks that
 * escaping worked and the length does not go over the Telegram limit, plus
 * the invariants of the new format (approved by the owner on 20.08.2026): the
 * tags on the first line, the machine key equal to the instance tag, a field
 * as a bold label plus a plain value, an icon from the shared vocabulary.
 * Node's built-in runner (`node --test`), no vitest or jest — it catches
 * exactly what can break without anyone noticing.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { ICON, severity, type NotifyEvent } from './events.ts';
import { render, eventKey, clampMessage, markdownToTelegram, OUTCOME_TAG } from './render.ts';
import { trend } from './trend.ts';

const XSS = '<script>alert(1)</script>';

const SAMPLES: NotifyEvent[] = [
  { type: 'deploy', project: 'playhub', status: 'fail', commit: XSS, url: 'https://x' },
  { type: 'job', project: 'playhub', job: XSS, status: 'ok', stats: [['метка', XSS]] },
  { type: 'report', project: 'playhub', title: XSS, aside: '26 июля', lines: [['ключ', XSS]] },
  { type: 'ci', project: 'arvent', status: 'fail', branch: 'master', commitTitle: XSS, actor: 'x' },
  { type: 'pr', project: 'arvent', action: 'opened', number: 1, title: XSS, author: XSS },
  { type: 'issue', project: 'arvent', action: 'opened', number: 1, title: XSS, assignee: XSS },
  { type: 'incident', project: 'arvent', title: XSS, detail: XSS },
  { type: 'heartbeat_miss', project: 'playhub', job: XSS, lastSeen: '10:00' }
];

for (const sample of SAMPLES) {
  test(`${sample.type}: escapes and fits under the limit`, () => {
    const text = render(sample);

    assert.ok(!text.includes('<script>'), 'a raw <script> must not pass into the output');
    assert.ok(text.includes('&lt;script&gt;'), 'the escaped form must be present');
    assert.ok(text.length <= 4096, `length ${text.length} goes over the Telegram limit`);
  });
}

test('the tags are the first line, BEFORE the text, not after', () => {
  const text = render({ type: 'ci', project: 'arvent', status: 'ok', branch: 'master' });

  assert.match(text, /^#ci #master #ok\n/, `the tags are not on the first line: ${text.slice(0, 40)}`);
});

test('the instance tag equals the parser\'s machine key — one value, not two', () => {
  const e: NotifyEvent = { type: 'job', project: 'playhub', job: 'Импорт игр', status: 'fail' };
  const text = render(e);

  assert.ok(text.startsWith(`#job #${eventKey(e)} #fail\n`), 'the tag on top does not match eventKey()');
});

test('slug: the separator is an underscore, not a dash (a dash breaks a Telegram hashtag)', () => {
  const text = render({ type: 'job', project: 'playhub', job: 'GitHub board sync', status: 'fail' });

  assert.ok(text.includes('#job #github_board_sync'));
  assert.ok(!text.includes('-'), `a dash leaked into the tag: ${text.slice(0, 60)}`);
});

test('an explicit --key beats the derived one, also through an underscore', () => {
  const text = render({ type: 'job', project: 'playhub', job: 'x', status: 'fail', key: 'vps backups' });

  assert.ok(text.startsWith('#job #vps_backups #fail\n'));
});

test('the red 🔴 and the later success share the same key — otherwise the parser has nothing to match against', () => {
  const red: NotifyEvent = { type: 'heartbeat_miss', project: 'vault', job: 'Дайджест задач' };
  const green: NotifyEvent = { type: 'heartbeat_miss', project: 'vault', job: 'Дайджест задач', recovered: true };

  assert.equal(eventKey(red), eventKey(green));
});

/**
 * The icon vocabulary, as the owner set it on 25.08.2026: inside ONE tag every
 * word wears its own icon, and one meaning wears one icon across all tags — a
 * failure looks the same whether it is a deploy, a check or a task. This table
 * is the law; the catalogue page renders from the same renderer, so nothing can
 * promise him an icon the code does not draw.
 */
const VOCABULARY: Array<[NotifyEvent, string]> = [
  [{ type: 'deploy', project: 'arvent', status: 'ok' }, ICON.ok],
  [{ type: 'deploy', project: 'arvent', status: 'fail' }, ICON.red],
  [{ type: 'ci', project: 'arvent', status: 'ok' }, ICON.ok],
  [{ type: 'ci', project: 'arvent', status: 'fail' }, ICON.red],
  [{ type: 'job', project: 'arvent', job: 'x', status: 'ok' }, ICON.ok],
  [{ type: 'job', project: 'arvent', job: 'x', status: 'fail' }, ICON.red],
  [{ type: 'job', project: 'arvent', job: 'x', status: 'disabled' }, ICON.off],
  [{ type: 'job', project: 'arvent', job: 'x', status: 'silent' }, ICON.unknown],
  [{ type: 'pr', project: 'arvent', action: 'opened', number: 1, title: 't' }, ICON.fresh],
  [{ type: 'pr', project: 'arvent', action: 'approved', number: 1, title: 't' }, ICON.approved],
  [{ type: 'pr', project: 'arvent', action: 'changes_requested', number: 1, title: 't' }, ICON.changes],
  [{ type: 'pr', project: 'arvent', action: 'merged', number: 1, title: 't' }, ICON.landed],
  [{ type: 'pr', project: 'arvent', action: 'closed', number: 1, title: 't' }, ICON.discarded],
  [{ type: 'issue', project: 'arvent', action: 'opened', number: 1, title: 't' }, ICON.fresh],
  [{ type: 'issue', project: 'arvent', action: 'assigned', number: 1, title: 't' }, ICON.taken],
  [{ type: 'issue', project: 'arvent', action: 'closed', number: 1, title: 't' }, ICON.ok],
  [{ type: 'session', project: 'mac-config', action: 'burning the limit' }, ICON.alarm],
  [{ type: 'incident', project: 'arvent', title: 't' }, ICON.alarm],
  [{ type: 'report', project: 'arvent', title: 't', lines: [] }, ICON.info],
  [{ type: 'heartbeat_miss', project: 'arvent', job: 'x' }, ICON.unknown],
  [{ type: 'heartbeat_miss', project: 'arvent', job: 'x', recovered: true }, ICON.ok]
];

const wordOf = (e: NotifyEvent): string => {
  const line = render(e).split('\n')[1];
  return line.replace(/<[^>]+>/g, '').split(': ').slice(1).join(': ') || line;
};

test('vocabulary: every word gets the icon the table promises', () => {
  for (const [e, icon] of VOCABULARY) {
    const line = render(e).split('\n')[1];
    assert.ok(line.startsWith(`${icon} `), `${e.type}: expected ${icon}, got ${line}`);
  }
});

test('vocabulary: inside one tag, two words never share an icon', () => {
  const owner = new Map<string, string>();

  for (const [e, icon] of VOCABULARY) {
    const at = `${e.type}:${icon}`;
    const word = wordOf(e);
    const taken = owner.get(at);

    assert.ok(
      taken === undefined || taken === word,
      `#${e.type}: "${taken}" and "${word}" both wear ${icon} — he cannot tell them apart`
    );
    owner.set(at, word);
  }
});

test('vocabulary: no card draws an icon that is not in the list', () => {
  const known = new Set<string>(Object.values(ICON));

  for (const e of [...SAMPLES, ...VOCABULARY.map(([x]) => x)]) {
    const icon = render(e).split('\n')[1].split(' ')[0];
    assert.ok(known.has(icon), `${e.type}: ${icon} is not in the vocabulary`);
  }
});

test('type line: the icon stays outside the bold, no name is invented, the outcome is spelled out', () => {
  const text = render({ type: 'ci', project: 'arvent', status: 'ok' });
  const secondLine = text.split('\n')[1];

  // Nothing named this run, so line 2 is just the type — no made-up name.
  // The outcome DOES repeat here, in parens, on top of the icon and the tag:
  // tried icon-and-tag-only first, and on a small screen or a lost color it
  // read as "something happened," not "it failed" — found live, 26.08.2026.
  assert.equal(secondLine, '✅ <b>CI (OK)</b>');
});

test('field: a bold label with a capital letter, the value as plain text', () => {
  const text = render({ type: 'job', project: 'arvent', job: 'x', status: 'fail', note: 'причина' });

  assert.ok(text.includes('<b>Reason:</b> причина'));
  assert.ok(!text.includes('<b>Reason:</b> <b>причина</b>'), 'the value must not be bold');
});

test('commit/pr/issue: one form — identifier, then the body as a quote, no doubles', () => {
  const ci = render({
    type: 'ci',
    project: 'arvent',
    status: 'ok',
    commit: '9b1fc68',
    commitUrl: 'https://github.com/sazanwork/arvent/commit/9b1fc68',
    commitTitle: 'Онбординг: заготовки вопросов (#294)'
  });

  // One row: the hash is the link, the title stands beside it. The hash spent
  // 31.08–03.09.2026 as plain text here with its link parked in a `Source:`
  // row at the bottom, printed a second time — the owner: "хэш можно сделать
  // кликабельным". `Title:` under it was the same second row the issue card
  // had already lost.
  assert.ok(ci.includes(
    '<b>Commit:</b> <a href="https://github.com/sazanwork/arvent/commit/9b1fc68">9b1fc68</a> · Онбординг: заготовки вопросов (#294)'
  ));
  assert.ok(!ci.includes('<b>Source:</b>'), 'the Source row is gone — the link is on the hash');
  assert.ok(!ci.includes('<b>Title:</b>'), 'the Title row came back on the commit');
  // A commit title is a field, not a quote: the quote holds ONLY the body. With
  // no body there is no quote.
  assert.ok(!ci.includes('<blockquote>'), 'no body means no quote');
  assert.equal((ci.match(/Онбординг: заготовки вопросов \(#294\)/g) ?? []).length, 1);

  const issue = render({
    type: 'issue',
    project: 'arvent',
    action: 'opened',
    number: 322,
    title: 'Коммиты не следуют конвенции',
    body: 'разбор 150 коммитов'
  });

  // Line 2 is `Issue #322 · title`: the number first, the title after a middle
  // dot (03.09.2026). No url on this one, so the number is plain text — it
  // stays rather than vanishing from the card altogether.
  assert.equal(issue.split('\n')[1], '🆕 <b>Issue (Opened)</b> #322 · Коммиты не следуют конвенции');
  assert.ok(!issue.includes('<b>Number:</b>'), 'the Number row came back');
  assert.ok(!issue.includes('<b>Title:</b>'), 'the Title row came back');
  assert.equal((issue.match(/<b>Issue \(Opened\)<\/b>/g) ?? []).length, 1, 'the type label must not repeat');
  assert.ok(issue.includes('<blockquote>разбор 150 коммитов</blockquote>'));
});

test('report groups: the heading is italic+underline, not bold, and has no colon', () => {
  const text = render({
    type: 'report',
    project: 'arvent',
    title: 'tasks',
    aside: '20.08',
    lines: [],
    groups: [
      { name: 'Ready', items: [{ label: '#243 (overdue)', text: 'Развернуть продукт', url: 'https://x/243' }] },
      { name: 'In Progress', items: [{ label: '#287', text: 'Проверить лист', url: 'https://x/287' }] }
    ]
  });

  assert.ok(text.includes('<i><u>Ready</u></i>'));
  assert.ok(text.includes('<i><u>In Progress</u></i>'));
  assert.ok(!text.includes('<b><u>'), 'the group heading must not be bold');
  assert.ok(text.includes('<b>#243 (overdue):</b> <a href="https://x/243">Развернуть продукт</a>'));
});

test('job disabled: the list of disabled items is numbered, with no label on each row', () => {
  const text = render({
    type: 'job',
    project: 'playhub',
    job: 'actions_off',
    status: 'disabled',
    note: 'причина',
    items: [
      { text: 'Weekly Game Validator', url: 'https://x/1' },
      { text: 'Mobile Compat Check', url: 'https://x/2' }
    ]
  });

  assert.ok(text.includes('<i><u>Disabled workflows</u></i>'));
  assert.ok(text.includes('1. <a href="https://x/1">Weekly Game Validator</a>'));
  assert.ok(text.includes('2. <a href="https://x/2">Mobile Compat Check</a>'));
});

test('incident: the log is a monospaced local path, not a link — and one label', () => {
  const text = render({ type: 'incident', project: 'arvent', title: 'x', detail: 'reason', logs: '~/.claude/logs/' });

  // `Log:`, the same word a job card uses. It said `Logs:` here — one concept
  // under two labels, decided by which type happened to be rendering.
  assert.ok(text.includes('<b>Log:</b> <code>~/.claude/logs/</code>'));
  assert.ok(!text.includes('<b>Logs:</b>'), 'the second label for one thing came back');
});

test('report: items render as links, text is escaped (flat view with no groups)', () => {
  const text = render({
    type: 'report',
    project: 'arvent',
    title: 'Дайджест',
    lines: [['Открыто', 2]],
    items: [
      { text: `#38 ${XSS}`, url: 'https://github.com/x/y/issues/38' },
      { text: 'без ссылки' }
    ]
  });

  assert.ok(text.includes('<a href="https://github.com/x/y/issues/38">'), 'the link must stay clickable');
  assert.ok(text.includes('&lt;script&gt;'), 'the item text must be escaped');
  assert.ok(!text.includes('<script>'), 'the raw tag must not pass through');
  assert.ok(text.includes('• без ссылки'), 'an item with no url is just a plain line');
});

test('clampMessage cuts long text, the tags stay untouched on the FIRST line', () => {
  const long = Array.from({ length: 500 }, (_, i) => `строка ${i}`).join('\n');
  const clamped = render({ type: 'incident', project: 'playhub', title: 'x', detail: long });

  assert.ok(clamped.length <= 4096, `length ${clamped.length} goes over the Telegram limit`);
  assert.ok(clamped.startsWith('#incident #x #fail\n'), `the tags did not stay on the first line: ${clamped.slice(0, 40)}`);
  assert.ok(clamped.includes('⋯ cut'), 'the cut must announce itself with the marker');
});

test('a giant file title with no --key does not push the caption over 1024', () => {
  const caption = render({
    type: 'report',
    project: 'arvent',
    title: 'Щ'.repeat(1100),
    path: '/tmp/x.txt'
  });

  assert.ok(caption.length <= 1024, `caption is longer than the limit: ${caption.length}`);
});

test('the file caption fits under the 1024 caption limit and still carries the tag', () => {
  const caption = render({
    type: 'report',
    project: 'arvent',
    title: 'Полные диалоги',
    path: '/tmp/x.txt',
    aside: 'Ы'.repeat(3000)
  });

  assert.ok(caption.length <= 1024, `caption is longer than the limit: ${caption.length}`);
  assert.ok(caption.startsWith('#report #полные_диалоги #info\n'));
});

test('a long text on ONE line is not thrown away whole', () => {
  const clamped = render({
    type: 'incident',
    project: 'playhub',
    title: 'Упал импорт',
    detail: 'A'.repeat(6000)
  });

  assert.ok(clamped.length > 3000, `content was lost, length is only ${clamped.length}`);
  assert.ok(clamped.includes('AAAA'));
});

// This counts EVERY tag the package can draw, and on several forms — the
// previous version looked only at <b>, and only on the job card. Because of
// that, two real breakages slipped through: a long detail gets cut inside a
// blockquote, and a long group name gets cut inside <u>, and Telegram
// answers 400 to that, meaning it loses the WHOLE message. The second assert
// of the previous version (`!/<[a-z]*$/`) could never fail: the clamper
// always appends `\n…`, and the end of the string can never fall inside a
// tag by construction.
const TAGS = ['b', 'i', 'u', 'a', 'code', 'pre', 'blockquote'];

const unbalanced = (html: string): string[] =>
  TAGS.filter((t) => {
    const opened = (html.match(new RegExp(`<${t}[ >]`, 'g')) ?? []).length;
    const closed = (html.match(new RegExp(`</${t}>`, 'g')) ?? []).length;

    return opened !== closed;
  });

test('the clamp does not leave an unclosed tag on any form', () => {
  const long = 'Ж'.repeat(5000);

  const cases: Array<[string, NotifyEvent]> = [
    ['job note', { type: 'job', project: 'playhub', job: 'x', status: 'fail', note: long }],
    ['incident detail', { type: 'incident', project: 'vault', title: 'x', detail: long }],
    ['issue body', { type: 'issue', project: 'arvent', action: 'opened', number: 1, title: 'x', body: long }],
    ['group name', { type: 'report', project: 'playhub', title: 'x', groups: [{ name: long, items: [] }] }],
    ['item link', { type: 'job', project: 'playhub', job: 'x', status: 'ok', items: [{ text: long, url: 'https://x/y' }] }]
  ];

  for (const [name, event] of cases) {
    const out = render(event);

    assert.deepEqual(unbalanced(out), [], `${name}: an unclosed tag — Telegram will reject the whole message`);
  }
});

test('the tag-balance check is able to fail', () => {
  // A guard over the guard: the assert above is only as good as
  // `unbalanced`. If it stops noticing an unclosed tag, the test above it
  // will pass on a broken render and nobody will see it.
  assert.deepEqual(unbalanced('<b>x</b><u>y'), ['u']);
  assert.deepEqual(unbalanced('<blockquote>x'), ['blockquote']);
  assert.deepEqual(unbalanced('<b>x</b>'), []);
});

test('an unknown event type gives a clear error, not a crash of the renderer', () => {
  assert.throws(
    () => render({ type: 'bogus', project: 'playhub' } as unknown as NotifyEvent),
    /unknown event type/
  );
});

test('issue: the assignee ends up in the message', () => {
  const out = render({
    type: 'issue',
    project: 'arvent',
    action: 'assigned',
    number: 128,
    title: 'Лист ожидания',
    assignee: 'Ilja'
  });

  assert.match(out, /#128/);
  assert.match(out, /Ilja/);
});

test('issue/pr: the number is the link on line 2, first, and never disappears', () => {
  // 03.09.2026: the number came back up from the `Source` row to line 2 and
  // became the link there — `Issue <a>#128</a> · Waiting list`. The owner:
  // "номер перенести в title и сделать кликабельным … и разделить их как-то с
  // title". With no url the number is plain, but it is never erased: the card
  // must not name a task without saying which one.
  const linked = render({
    type: 'issue', project: 'arvent', action: 'assigned', number: 128,
    title: 'Waiting list', assignee: 'Ilja', url: 'https://x/i/128'
  });

  assert.equal(linked.split('\n')[1], '🙋 <b>Issue (Assigned)</b> <a href="https://x/i/128">#128</a> · Waiting list');
  assert.ok(!linked.includes('<b>Source:</b>'), 'the Source row is gone');
  assert.ok(!linked.includes('issue #128'), 'the type word came back into the link');
  // Exactly once as `#128`: on line 2. The instance tag is `#i128`, a
  // different string.
  assert.equal((linked.match(/#128/g) ?? []).length, 1, 'the number is printed more than once');
  assert.ok(linked.includes('#i128'), 'the instance tag lost the number');

  const bare = render({
    type: 'issue', project: 'arvent', action: 'assigned', number: 128,
    title: 'Waiting list', assignee: 'Ilja'
  });

  assert.equal(bare.split('\n')[1], '🙋 <b>Issue (Assigned)</b> #128 · Waiting list', 'no url — the number stays, plain');
  assert.ok(!bare.includes('href="https://x/i/128"'), 'a link to the issue appeared out of nowhere');

  // A pull request is named the same way. No title: the line ends at the number.
  const pr = render({
    type: 'pr', project: 'playhub', action: 'opened', number: 118,
    title: 'Category hints', url: 'https://x/p/118'
  });
  assert.equal(pr.split('\n')[1], '🆕 <b>PR (Opened)</b> <a href="https://x/p/118">#118</a> · Category hints');
  const untitled = render({ type: 'pr', project: 'playhub', action: 'opened', number: 118, title: '', url: 'https://x/p/118' });
  assert.equal(untitled.split('\n')[1], '🆕 <b>PR (Opened)</b> <a href="https://x/p/118">#118</a>');
});

test('deploy: with no workflow run, the commit hash is the only link, and it is on the Commit row', () => {
  // A deploy run by hand from the Mac has no workflow run at all: the hash is
  // the card's one way back to its source, and it is clickable where it stands.
  const out = render({
    type: 'deploy',
    project: 'game-publisher',
    status: 'ok',
    commit: 'abc123',
    commitUrl: 'https://github.com/sazanwork/game-publisher/commit/abc123',
    commitTitle: 'fix(import): skip games with no cover'
  });

  assert.ok(out.includes(
    '<b>Commit:</b> <a href="https://github.com/sazanwork/game-publisher/commit/abc123">abc123</a> · fix(import): skip games with no cover'
  ));
  assert.ok(!out.includes('<b>Source:</b>'), 'the Source row is gone');
  assert.equal((out.match(/abc123/g) ?? []).length, 2, 'the hash is in the href and in the text, nowhere else');
});

test('deploy: the run link is on the name, the commit link on the hash — no Source row', () => {
  const out = render({
    type: 'deploy',
    project: 'playhub',
    status: 'ok',
    commit: 'abc123',
    commitUrl: 'https://x/c',
    via: 'GitHub Actions',
    workflowUrl: 'https://x/run'
  });

  assert.equal(out.split('\n')[1], '✅ <b>Deploy (OK):</b> <a href="https://x/run">GitHub Actions</a>');
  assert.ok(out.includes('<b>Commit:</b> <a href="https://x/c">abc123</a>'));
  assert.ok(!out.includes('<b>Source:</b>'));
  assert.ok(!out.includes('workflow run'), 'the two words that named nothing are gone');
});

test('deploy: a commit url with no hash produces no link at all', () => {
  // There would be no text to put on it but the bare word `commit`, which
  // tells the reader nothing they can use.
  const out = render({
    type: 'deploy',
    project: 'game-publisher',
    status: 'ok',
    commitUrl: 'https://github.com/sazanwork/game-publisher/commit/abc123',
    commitTitle: 'fix(import): skip games with no cover'
  });

  assert.ok(!out.includes('<a href'), 'a link appeared with nothing to name it');
  assert.ok(out.includes('<b>Commit:</b> fix(import): skip games with no cover'));
});

test('deploy: reason explains a cancel/skip — as the same field, not a quote', () => {
  const out = render({
    type: 'deploy',
    project: 'playhub',
    status: 'fail',
    note: 'отменён: секреты не нашли'
  });

  assert.ok(out.includes('<b>Reason:</b> отменён: секреты не нашли'));
  assert.ok(!out.includes('<blockquote>отменён'), 'reason is a field, not a quote');
});

test('incident: detail is quoted in full, never cut to its first line', () => {
  // This test used to assert the opposite — that a long detail stayed a
  // one-line field. That WAS the bug: `field()` keeps only the first line, and
  // vault (the only sender of this type) passes a three-line diagnosis, so
  // every alarm arrived gutted. The title is the type line now and the
  // diagnosis is quoted under it, the same shape a commit body already had.
  const multiline = 'нет sops\nключ не найден\nлог: ~/Library/Logs/vault.log';
  const short = render({ type: 'incident', project: 'vault', title: 'Vault needs a fix', detail: multiline });
  const long = render({ type: 'incident', project: 'vault', title: 'Vault needs a fix', detail: 'А'.repeat(500) });

  assert.equal(short.split('\n')[1], '🚨 <b>Incident (Vault):</b> Vault needs a fix');
  assert.ok(short.includes('лог: ~/Library/Logs/vault.log'), 'the last line of the diagnosis was cut off');
  assert.ok(short.includes('<blockquote>'), 'the diagnosis must be quoted');
  assert.ok(long.includes('<blockquote expandable>'), 'a long diagnosis folds up');
});

test('incident: detail equal to title is not printed twice', () => {
  const out = render({ type: 'incident', project: 'vault', title: 'Vault needs a fix', detail: 'Vault needs a fix' });

  assert.equal(out.split('\n')[1], '🚨 <b>Incident (Vault):</b> Vault needs a fix');
  assert.ok(!out.includes('<blockquote>'), 'the quote repeats the title');
});

test('a multiline commit title is cut to its first line (protects against the full body in a field)', () => {
  const messy = 'Онбординг: заготовки вопросов (#294)\n\n* feat(onboarding): длинное тело\n\nещё абзац';
  const ci = render({ type: 'ci', project: 'arvent', status: 'ok', commit: '9b1fc68', commitTitle: messy });

  assert.ok(ci.includes('Онбординг: заготовки вопросов (#294)…'), 'the commit title is not cut to its first line');
  assert.ok(!ci.includes('feat(onboarding)'), 'the multiline commitTitle leaked into the quote in full');
});

test('job stats: the value is not bold, a field is label+value', () => {
  const out = render({ type: 'job', project: 'vault', job: 'x', status: 'ok', stats: [['вердикт', 'ok']] });

  assert.ok(out.includes('<b>Вердикт:</b> ok'));
  assert.ok(!out.includes('<b>ok</b>'));
});

test('field/fieldLink accept null as an absent value (JSON over stdin sends null, not a missing key)', () => {
  const out = render({
    type: 'job',
    project: 'arvent',
    job: 'x',
    status: 'ok',
    note: null as unknown as string,
    stats: [['A', null as unknown as string]]
  });

  assert.ok(!out.includes('undefined'));
  assert.ok(!out.includes('null'));
});

test('workflow with no url — there is no row at all, not "Check: run" without a link', () => {
  const out = render({ type: 'ci', project: 'arvent', status: 'ok' });

  assert.ok(!out.includes('Check'), 'there is nothing to open — there must be no row');
  assert.ok(!out.includes('Workflow'), 'the old trailing row must not come back');
});

// What ran IS the identifier of the card, so it stands ON the type line and
// carries the link, exactly as a job's name and a report's name do. It used to
// be one fact split in three: `Deploy: ok` on line 2, `Via:` under it and a
// trailing `Workflow:` row eight lines below, all naming the same run.
test('run: what ran is the type line itself and carries the link', () => {
  const deploy = render({
    type: 'deploy', project: 'playhub', status: 'fail',
    commit: 'a1b2c3d', commitUrl: 'https://x/c',
    via: 'GitHub Actions', workflowName: 'Deploy to Beget', workflowUrl: 'https://x/run'
  });

  assert.equal(
    deploy.split('\n')[1],
    '\u{1F534} <b>Deploy (Fail):</b> <a href="https://x/run">Deploy to Beget</a>'
  );
  assert.ok(!deploy.includes('<b>Source:</b>'), 'the run link rides on the name, not in a Source row');
  assert.ok(!deploy.includes('<b>Via:</b>'), 'the Via row carried the name a floor below');
  assert.ok(!deploy.includes('<b>Workflow:</b>'), 'the trailing Workflow row had to go');

  const ci = render({
    type: 'ci', project: 'arvent', status: 'fail', branch: 'master',
    commit: '9b1fc68', commitUrl: 'https://x/c',
    workflowName: 'nightly', workflowUrl: 'https://x/run'
  });

  assert.equal(
    ci.split('\n')[1],
    '\u{1F534} <b>CI (Fail):</b> <a href="https://x/run">nightly</a>'
  );
  assert.ok(!ci.includes('<b>Source:</b>'), 'the run link rides on the name on CI too');
  assert.ok(!ci.includes('<b>Workflow:</b>'), 'the trailing Workflow row had to go from CI too');
});

// `GitHub Actions` is the same on every card in every repository — as the
// link's name it names nothing. The workflow's own name does name something.
test('run: the workflow name beats the platform as the link text', () => {
  const out = render({
    type: 'deploy', project: 'playhub', status: 'ok',
    commit: 'a1b2c3d', commitUrl: 'https://x/c',
    via: 'GitHub Actions', workflowName: 'Deploy to Beget', workflowUrl: 'https://x/run'
  });

  assert.ok(out.includes('<b>Deploy (OK):</b> <a href="https://x/run">Deploy to Beget</a>'), 'the type line must carry the workflow name, linked');
  assert.ok(!out.includes('>GitHub Actions</a>'), 'the platform is not the name of the run');
});

// A hand deploy has no run to open: the type line still says by what means it
// went out, it is simply not a link.
test('run: a hand deploy names the means and has nothing to open', () => {
  const out = render({
    type: 'deploy', project: 'game-publisher', status: 'ok',
    commit: '3f1a882', commitUrl: 'https://x/c', via: 'manual, from the Mac'
  });

  assert.equal(out.split('\n')[1], '\u2705 <b>Deploy (OK):</b> manual, from the Mac');
  assert.ok(!out.includes('<a href="https://x/run"'), 'a hand deploy has no run');
});

// Facts about the RUN touch the type line, because the type line already names
// the run — the same place a job card puts `Reason:`. `Actor` names who is
// behind the COMMIT, so it moved into the Change block, next to the commit
// itself — the owner: "commit, actor, workflow — I don't know, it's all a
// jumble."
test('blocks: run facts touch the name, the commit keeps its heading', () => {
  const both = render({
    type: 'ci', project: 'arvent', status: 'fail', branch: 'master',
    commit: '9b1fc68', commitUrl: 'https://x/c', actor: '@ilja',
    note: '3 tests failed', workflowUrl: 'https://x/run', workflowName: 'nightly'
  });
  const rows = both.split('\n');

  assert.ok(!both.includes('<i><u>Run</u></i>'), 'the Run heading announced what line 2 already said');
  assert.equal(rows[2], '<b>Reason:</b> 3 tests failed');
  assert.equal(rows[3], '');
  assert.equal(rows[4], '<i><u>Change</u></i>');
  assert.equal(rows[5], '<b>Commit:</b> <a href="https://x/c">9b1fc68</a>');
  assert.equal(rows.length, 6, 'no Actor row after the commit');

  // A green deploy: no reason to give, so the card is only name plus commit.
  const one = render({
    type: 'deploy', project: 'game-publisher', status: 'ok',
    commit: '3f1a882', commitUrl: 'https://x/c', via: 'manual, from the Mac'
  });

  assert.ok(one.includes('<i><u>Change</u></i>'), 'the commit block lost its heading');
  assert.ok(!one.includes('<i><u>Run</u></i>'), 'a heading appeared over nothing');
});

// The sender names the group, and a named group always prints — there is no
// "two or more" threshold: the backup-copies card has every number in one
// group, and a threshold would silence exactly the seam the owner asked for
// groups to show.
test('groups: a named group always prints its heading, even alone', () => {
  const out = render({
    type: 'job', project: 'mac-config', job: 'Server backups', status: 'fail',
    note: 'nothing to roll back to',
    stats: [['Fresh', 10, 'Copies on the Mac'], ['Broken', 1, 'Copies on the Mac']]
  });

  assert.ok(out.includes('<i><u>Copies on the Mac</u></i>'), 'the heading of a lone group was lost');
  assert.ok(out.indexOf('<b>Reason:</b>') < out.indexOf('<i><u>Copies'), 'the story of the run must come before the numbers');
});

// Rows with no group name behave as before — over 20 senders send flat
// pairs and must not change.
test('groups: untagged pairs still render flat', () => {
  const out = render({
    type: 'job', project: 'playhub', job: 'Import', status: 'ok',
    stats: [['Published', 9], ['Stuck', 2]]
  });

  assert.ok(!out.includes('<i><u>'), 'unnamed rows must have no heading');
  assert.ok(out.includes('<b>Published:</b> 9'));
});

// A blank line means a change of block. Two in a row would mean an empty
// block, and a leading one a block that does not exist; both used to appear
// when some fields did not arrive.
test('seams: never two blank lines in a row, never one at the top', () => {
  const out = render({
    type: 'job', project: 'playhub', job: 'Import', status: 'ok',
    stats: [['Published', 9, 'Result']]
  });

  assert.ok(!out.includes('\n\n\n'), 'a double blank line');
  assert.ok(!/^#[^\n]*\n\n\n/.test(out), 'an empty block right under the tags');
});

test('run: a nameless run keeps its link rather than losing it', () => {
  const out = render({
    type: 'deploy', project: 'playhub', status: 'fail',
    commit: 'a1b2c3d', commitUrl: 'https://x/c', url: 'https://x/run'
  });

  // The link rides on the bare type word. The card still does not invent a name.
  assert.equal(out.split('\n')[1], '\u{1F534} <a href="https://x/run"><b>Deploy (Fail)</b></a>');
  assert.ok(!out.includes('<b>Source:</b>'), 'the Source row is gone');
});

test('severity: job disabled rings like fail, heartbeat recovered stays quiet like success', () => {
  assert.equal(severity({ type: 'job', project: 'arvent', job: 'x', status: 'disabled' }), 'error');
  assert.equal(severity({ type: 'heartbeat_miss', project: 'arvent', job: 'x', recovered: true }), 'info');
  assert.equal(severity({ type: 'heartbeat_miss', project: 'arvent', job: 'x' }), 'error');
});

// ─── Full-card snapshots, one per event type ───────────────────────────────
//
// `assert.equal` on the WHOLE card, not `assert.match` on a fragment. The
// fragment tests above cannot see a blank line appear or vanish, and blank
// lines are what the approved format is made of: header block, object block,
// actions block. A card that silently loses the blank before `Workflow:` still
// passed every test in this file before these existed.
//
// When one of these fails, read the diff as a question — "was this change
// meant?" — not as a chore. The owner approves the card shapes type by type.

test('card/job fail: task name is on the card, not only in the tag', () => {
  const out = render({
    type: 'job', project: 'mac-config', key: 'vps-backups',
    job: 'Backups from the server', status: 'fail',
    note: 'no fresh copy arrived from the server'
  });

  assert.equal(out, [
    '#job #vps_backups #fail',
    '🔴 <b>Job (Fail):</b> Backups from the server',
    '<b>Reason:</b> no fresh copy arrived from the server'
  ].join('\n'));
});

// A job used to say only its name. The Mac's launchd, a VPS cron, GitHub
// Actions and the silence watchdog all arrived under one bare `#job` tag and
// only memory told them apart. `via` says the place, in its own row directly
// under the type line — the bracket on the type word belongs to the OUTCOME on
// every type (the owner's decision, 03.09.2026: one slot, one meaning), and a
// job's outcome now reads exactly the way a deploy's does.
test('card/job: the bracket says how it ended, and a Via row says where it ran', () => {
  const mac = render({
    type: 'job', project: 'mac-config', key: 'config-sync',
    job: 'config sync', status: 'fail', via: 'mac',
    note: 'symlink missing'
  });

  assert.equal(mac, [
    '#job #config_sync #fail',
    '🔴 <b>Job (Fail):</b> config sync',
    '<b>Via:</b> Mac',
    '<b>Reason:</b> symlink missing'
  ].join('\n'));

  // `Via` stands FIRST among the facts, right under the type line: it
  // qualifies every row below it.
  assert.equal(mac.split('\n')[2], '<b>Via:</b> Mac');

  // All four job outcomes get their word, and the icon and the word agree.
  const outcomes: Array<[NotifyEvent['type'] extends never ? never : 'ok' | 'fail' | 'disabled' | 'silent', string]> = [
    ['ok', '✅ <b>Job (OK):</b> J'],
    ['fail', '🔴 <b>Job (Fail):</b> J'],
    ['disabled', '🚫 <b>Job (Off):</b> J'],
    ['silent', '❓ <b>Job (Silent):</b> J']
  ];
  for (const [status, line] of outcomes) {
    const out = render({ type: 'job', project: 'mac-config', key: 'k', job: 'J', status });
    assert.equal(out.split('\n')[1], line, `status ${status}`);
  }

  // `aside` lost its bracket with the rest. It is a sentence about why the
  // card exists, which is the Reason row's job — and only when the sender left
  // that row empty.
  const vps = render({
    type: 'job', project: 'playhub', key: 'daily-import',
    job: 'Game import', status: 'ok', via: 'vps', aside: 'reporting again',
    duration: '4m 12s'
  });

  assert.equal(vps, [
    '#job #daily_import #ok',
    '✅ <b>Job (OK):</b> Game import',
    '<b>Via:</b> VPS',
    '<b>Reason:</b> reporting again',
    '<b>Took:</b> 4m 12s'
  ].join('\n'));

  // A real reason wins: `aside` never doubles it.
  const both = render({
    type: 'job', project: 'playhub', key: 'daily-import',
    job: 'Game import', status: 'fail', aside: 'reporting again', note: 'the feed was empty'
  });
  assert.ok(both.includes('<b>Reason:</b> the feed was empty'), both);
  assert.ok(!both.includes('reporting again'), 'aside must not double a real reason');

  // A word nobody foresaw still prints, with its first letter raised.
  const actions = render({
    type: 'job', project: 'mac-config', key: 'k', job: 'J', status: 'ok', via: 'actions'
  });
  assert.ok(actions.includes('<b>Via:</b> Actions'), actions);

  const other = render({
    type: 'job', project: 'mac-config', key: 'k', job: 'J', status: 'ok', via: 'hetzner'
  });
  assert.ok(other.includes('<b>Via:</b> Hetzner'), other);

  // Neither field present: no row, and the bracket still says how it ended.
  const bare = render({ type: 'job', project: 'mac-config', key: 'k', job: 'J', status: 'ok' });
  assert.equal(bare, ['#job #k #ok', '✅ <b>Job (OK):</b> J'].join('\n'));
  assert.ok(!bare.includes('<b>Via:</b>'), 'no via, no row');
  assert.ok(!bare.includes('Took'), 'a job that does not measure itself says nothing about time');
});

test('card/job with items: no "Disabled workflows" heading unless disabled', () => {
  const out = render({
    type: 'job', project: 'playhub', key: 'daily-import',
    job: 'Game import', status: 'ok',
    stats: [['published', '9']],
    items: [{ text: 'Cut the Rope', url: 'https://x/1' }]
  });

  assert.equal(out, [
    '#job #daily_import #ok',
    '✅ <b>Job (OK):</b> Game import',
    '<b>Published:</b> 9',
    '',
    '• <a href="https://x/1">Cut the Rope</a>'
  ].join('\n'));
});

test('card/job disabled: heading present, list numbered', () => {
  const out = render({
    type: 'job', project: 'mac-config', key: 'actions-minutes-guard',
    job: 'GitHub Actions minutes watchdog', status: 'disabled',
    note: 'free minutes almost gone',
    items: [{ text: 'arvent/nightly.yml' }, { text: 'one-q/quality.yml' }]
  });

  assert.equal(out, [
    // `#off`, not `#fail`: a watchdog that switched something off on purpose
    // is not a broken job, and the owner must be able to filter the two apart.
    '#job #actions_minutes_guard #off',
    '🚫 <b>Job (Off):</b> GitHub Actions minutes watchdog',
    '<b>Reason:</b> free minutes almost gone',
    '',
    '<i><u>Disabled workflows</u></i>',
    '1. arvent/nightly.yml',
    '2. one-q/quality.yml'
  ].join('\n'));
});

test('card/ci: commit hash links, body quoted under it', () => {
  const out = render({
    type: 'ci', project: 'arvent', status: 'ok', branch: 'master',
    commit: '9b1fc68', commitUrl: 'https://x/c',
    commitTitle: 'Онбординг: заготовки вопросов (#294)',
    commitBody: 'Тело коммита, написанное человеком.',
    actor: '@chelsnebes', workflowUrl: 'https://x/run'
  });

  // The actor is the owner himself and the row is printed all the same
  // (03.09.2026): the card carries the same rows whoever the person is.
  assert.equal(out, [
    '#ci #master #ok',
    '✅ <a href="https://x/run"><b>CI (OK)</b></a>',
    '',
    '<i><u>Change</u></i>',
    '<b>Commit:</b> <a href="https://x/c">9b1fc68</a> · Онбординг: заготовки вопросов (#294)',
    '<blockquote>Тело коммита, написанное человеком.</blockquote>'
  ].join('\n'));
});

test('card/ci: commit author links to their GitHub profile, distinct from Actor', () => {
  const out = render({
    type: 'ci', project: 'arvent', status: 'fail', branch: 'master',
    commit: '9b1fc68', commitUrl: 'https://x/c', commitTitle: 'fix: checkout',
    commitAuthor: 'Ilja-Prihach',
    actor: '@ilja_tg', workflowUrl: 'https://x/run'
  });

  assert.equal(out, [
    '#ci #master #fail',
    '🔴 <a href="https://x/run"><b>CI (Fail)</b></a>',
    '',
    '<i><u>Change</u></i>',
    '<b>Commit:</b> <a href="https://x/c">9b1fc68</a> · fix: checkout',
    '<b>Author:</b> <a href="https://github.com/Ilja-Prihach">Ilja-Prihach</a>'
  ].join('\n'));
});

test('card/deploy: commit author, with no Actor row — deploy has none', () => {
  const out = render({
    type: 'deploy', project: 'playhub', status: 'ok',
    commit: 'a1b2c3d', commitUrl: 'https://x/c', commitTitle: 'feat: new landing',
    commitAuthor: 'Ilja-Prihach',
    via: 'GitHub Actions', workflowUrl: 'https://x/run'
  });

  assert.equal(out, [
    '#deploy #playhub #ok',
    '✅ <b>Deploy (OK):</b> <a href="https://x/run">GitHub Actions</a>',
    '',
    '<i><u>Change</u></i>',
    '<b>Commit:</b> <a href="https://x/c">a1b2c3d</a> · feat: new landing',
    '<b>Author:</b> <a href="https://github.com/Ilja-Prihach">Ilja-Prihach</a>'
  ].join('\n'));
});

// The owner used to be filtered out of every people row. A card whose people
// rows vanish only for him reads as a card with a hole — he saw Issue #322 and
// PR #118 with no Author at all and asked where the people had gone
// (03.09.2026). Same set of rows on every card; an absent row now means an
// empty field.
test('people rows: the owner is printed like anyone else — Author, Assignee, Reviewer, Actor', () => {
  const pr = render({
    type: 'pr', project: 'arvent', action: 'opened', number: 1, title: 'x',
    author: 'mikitasazan', reviewer: 'Ilja-Prihach', url: 'https://x/p/1'
  });
  assert.ok(
    pr.includes('<b>Author:</b> <a href="https://github.com/mikitasazan">mikitasazan</a>'),
    'the owner as author is printed, with the same link as anyone else'
  );
  assert.ok(pr.includes('<b>Reviewer:</b> <a href="https://github.com/Ilja-Prihach">Ilja-Prihach</a>'));

  const issue = render({
    type: 'issue', project: 'arvent', action: 'assigned', number: 322, title: 'x',
    author: 'Ilja-Prihach', assignee: 'mikitasazan', url: 'https://x/i/322'
  });
  assert.ok(
    issue.includes('<b>Assignee:</b> <a href="https://github.com/mikitasazan">mikitasazan</a>'),
    'the owner as assignee is printed'
  );

  // `actor` is accepted from old senders and never printed (03.09.2026): on a
  // push it is the commit's author, on a schedule it is the workflow's owner.
  const ci = render({ type: 'ci', project: 'arvent', status: 'ok', actor: '@chelsnebes', commit: 'a', commitUrl: 'https://x/c' });
  assert.ok(!ci.includes('<b>Actor:</b>'), 'the Actor row is gone from CI');

  // The suppression was case-insensitive, so an upper-case spelling proves the
  // filter is gone rather than merely missed.
  const deploy = render({
    type: 'deploy', project: 'arvent', status: 'ok', commit: 'a', commitUrl: 'https://x/c',
    commitAuthor: 'MikitaSazan'
  });
  assert.ok(deploy.includes('<b>Author:</b> <a href="https://github.com/MikitaSazan">MikitaSazan</a>'));
});

test('card/ci scheduled: a run with no commit body still says why it ran', () => {
  const out = render({
    type: 'ci', project: 'arvent', status: 'ok', branch: 'master',
    commit: '9b1fc68', commitUrl: 'https://x/c',
    note: 'nightly check of master', workflowUrl: 'https://x/run'
  });

  assert.equal(out, [
    '#ci #master #ok',
    '✅ <a href="https://x/run"><b>CI (OK)</b></a>',
    '<b>Reason:</b> nightly check of master',
    '',
    '<i><u>Change</u></i>',
    '<b>Commit:</b> <a href="https://x/c">9b1fc68</a>'
  ].join('\n'));
});

test('card/deploy', () => {
  const out = render({
    type: 'deploy', project: 'playhub', status: 'ok',
    commit: 'a1b2c3d', commitUrl: 'https://x/c', commitTitle: 'feat: new landing',
    via: 'GitHub Actions', workflowUrl: 'https://x/run'
  });

  assert.equal(out, [
    '#deploy #playhub #ok',
    '✅ <b>Deploy (OK):</b> <a href="https://x/run">GitHub Actions</a>',
    '',
    '<i><u>Change</u></i>',
    '<b>Commit:</b> <a href="https://x/c">a1b2c3d</a> · feat: new landing'
  ].join('\n'));
});

test('card/issue: body arrives — it never did before', () => {
  const out = render({
    type: 'issue', project: 'mac-config', action: 'opened', number: 322,
    title: 'Commit convention for all repos',
    body: 'Тело задачи с GitHub, как его написал человек.',
    author: 'Ilja-Prihach', url: 'https://x/i/322'
  });

  assert.equal(out, [
    '#issue #i322 #info',
    '🆕 <b>Issue (Opened)</b> <a href="https://x/i/322">#322</a> · Commit convention for all repos',
    '<blockquote>Тело задачи с GitHub, как его написал человек.</blockquote>',
    '',
    '<b>Author:</b> <a href="https://github.com/Ilja-Prihach">Ilja-Prihach</a>'
  ].join('\n'));
});

// The body prints on EVERY action, quoted — the owner's final call,
// 31.08.2026: he wants the context without following the Source link. A long
// body collapses instead of being dropped (see the expandable test below).
test('card/issue: assigned carries the body too, quoted', () => {
  const out = render({
    type: 'issue', project: 'arvent', action: 'assigned', number: 312,
    title: 'Web booking page',
    body: 'A description he needs in front of him, not one link away.',
    author: 'mikitasazan', assignee: 'Ilja-Prihach', url: 'https://x/i/312'
  });

  assert.equal(out, [
    '#issue #i312 #info',
    '🙋 <b>Issue (Assigned)</b> <a href="https://x/i/312">#312</a> · Web booking page',
    '<blockquote>A description he needs in front of him, not one link away.</blockquote>',
    '',
    '<b>Author:</b> <a href="https://github.com/mikitasazan">mikitasazan</a>',
    '<b>Assignee:</b> <a href="https://github.com/Ilja-Prihach">Ilja-Prihach</a>'
  ].join('\n'));
});

test('quote: a body longer than a screenful collapses, by length OR by lines', () => {
  const byLength = render({
    type: 'issue', project: 'arvent', action: 'opened', number: 1, title: 't',
    body: 'x'.repeat(500)
  });
  const byLines = render({
    type: 'issue', project: 'arvent', action: 'opened', number: 1, title: 't',
    body: 'one\ntwo\nthree\nfour\nfive\nsix'
  });
  const short = render({
    type: 'issue', project: 'arvent', action: 'opened', number: 1, title: 't',
    body: 'two\nlines'
  });

  assert.ok(byLength.includes('<blockquote expandable>'), 'a long body must collapse');
  assert.ok(byLines.includes('<blockquote expandable>'), 'six short lines eat a screen too');
  assert.ok(!short.includes('expandable'), 'a two-line body must not hide itself');
});

test('fieldPerson: a multi-line login does not put a raw newline inside the href', () => {
  // Found by Codex/GLM review 2026-08-26: unlike `field`/`fieldLink`, these
  // two skipped `firstLine`, so a login/handle containing `\n` (only
  // reachable through `--json`/direct calls — a real GitHub login cannot
  // have one) put the newline straight into the `href` attribute itself.
  const person = render({
    type: 'issue', project: 'arvent', action: 'assigned', number: 1, title: 'x',
    assignee: 'alice\nbob'
  });

  assert.ok(!person.includes('href="https://github.com/alice\nbob"'), 'newline reached the href');
  assert.ok(person.includes('<b>Assignee:</b> <a href="https://github.com/alice…">alice…</a>'));
});

test('card/pr: body arrives, and a multi-line title is NOT cut', () => {
  const out = render({
    type: 'pr', project: 'playhub', action: 'opened', number: 294,
    title: 'Onboarding: question drafts',
    body: 'PR description here.',
    author: 'Ilja-Prihach', url: 'https://x/p/294'
  });

  assert.equal(out, [
    '#pr #p294 #info',
    '🆕 <b>PR (Opened)</b> <a href="https://x/p/294">#294</a> · Onboarding: question drafts',
    '<blockquote>PR description here.</blockquote>',
    '',
    '<b>Author:</b> <a href="https://github.com/Ilja-Prihach">Ilja-Prihach</a>'
  ].join('\n'));

  // One title is one line, the same for every type. It is the identifier now,
  // so a two-line title is cut at the first line like any other value.
  const twoLine = render({
    type: 'pr', project: 'playhub', action: 'opened', number: 1,
    title: 'first line\nsecond line'
  });
  assert.ok(twoLine.includes('<b>PR (Opened)</b> #1 · first line…'), 'no url, so the number stays on line 2');
  assert.ok(!twoLine.includes('second line'), 'a title is cut at its first line');
});

test('card/pr: a review verdict quotes the reviewer\'s own comment, not the PR description again', () => {
  const requested = render({
    type: 'pr', project: 'playhub', action: 'changes_requested', number: 118,
    title: 'Onboarding: question drafts',
    body: 'Please rename this variable, it shadows the outer one.',
    author: 'mikitasazan', reviewer: 'Ilja-Prihach', url: 'https://x/p/118'
  });

  // The verdict's quote is CAPTIONED `Review:` — on this action the body is
  // the reviewer's own comment, not the PR description, and the caption is
  // the only thing that says so.
  assert.equal(requested, [
    '#pr #p118 #info',
    '📝 <b>PR (Changes)</b> <a href="https://x/p/118">#118</a> · Onboarding: question drafts',
    '<b>Review:</b>',
    '<blockquote>Please rename this variable, it shadows the outer one.</blockquote>',
    '',
    '<b>Author:</b> <a href="https://github.com/mikitasazan">mikitasazan</a>',
    '<b>Reviewer:</b> <a href="https://github.com/Ilja-Prihach">Ilja-Prihach</a>'
  ].join('\n'));

  // An approval with no comment attached: no empty quote, no dangling blank line.
  const approvedSilent = render({
    type: 'pr', project: 'playhub', action: 'approved', number: 118,
    title: 'Onboarding: question drafts', reviewer: 'Ilja-Prihach'
  });
  assert.ok(!approvedSilent.includes('<blockquote>'), 'no comment means no quote');
  assert.ok(!approvedSilent.includes('\n\n<b>Reviewer'), 'no comment means no dangling blank line before Reviewer');

  // The description shows on every action (31.08.2026) — but on merged and
  // closed only its FIRST section (03.09.2026): the whole text was already read
  // when the PR was opened, and a merged card of 67 lines was the "wall of
  // text" the owner complained about.
  const merged = render({
    type: 'pr', project: 'playhub', action: 'merged', number: 118,
    title: 'Onboarding: question drafts', body: 'What this PR changed.'
  });
  assert.ok(merged.includes('<blockquote>What this PR changed.</blockquote>'), 'merged must carry the description too');
  assert.ok(!merged.includes('<b>Review:</b>'), 'only a verdict captions the quote as a review');

  const sectioned = '## Что меняется\n\nКнопка стала синей.\n\n## Как проверял\n\nnpm test — зелёный.\n\nCloses #5';
  const mergedLong = render({ type: 'pr', project: 'playhub', action: 'merged', number: 118, title: 't', body: sectioned });
  assert.ok(mergedLong.includes('<b>Что меняется</b>\n\nКнопка стала синей.'), 'the first section stays');
  assert.ok(!mergedLong.includes('Как проверял'), 'the second section is cut on merged');
  const openedLong = render({ type: 'pr', project: 'playhub', action: 'opened', number: 118, title: 't', body: sectioned });
  assert.ok(openedLong.includes('<b>Как проверял</b>'), 'opened keeps the whole body');
  assert.ok(!openedLong.includes('Closes #5'), 'GitHub bookkeeping lines are dropped');
});

test('markdown: a GitHub body is translated into Telegram markup, never pasted raw', () => {
  const body = [
    '<!-- Название PR — заголовок squash-коммита -->',
    '## Скриншоты приёмки',
    '',
    '![after 375](https://github.com/x/releases/download/a/after-375.png)',
    'См. [funnel.ts:300](web/src/server/bot/tools/funnel.ts:300) и [доску](https://x/board).',
    '',
    '| Что | Значение |',
    '|---|---|',
    '| Пилюля | y 675–719 |',
    '',
    '**Сцена.** Барбер `стрижёт` <всех> & обучает.',
    '',
    '```',
    'no   :: Вашу карточку я удалила.',
    '```',
    '',
    '',
    '',
    'Closes #405'
  ].join('\n');
  const out = markdownToTelegram(body);

  assert.ok(!out.includes('&lt;!--'), 'the template comment must be dropped');
  assert.ok(out.includes('<b>Скриншоты приёмки</b>'), 'a heading becomes a bold line');
  assert.ok(out.includes('<a href="https://github.com/x/releases/download/a/after-375.png">after 375</a>'), 'an image is a link named by its alt');
  assert.ok(out.includes('См. funnel.ts:300 и <a href="https://x/board">доску</a>.'), 'a repo path keeps only its text, a real url is a link');
  assert.ok(out.includes('Что · Значение\nПилюля · y 675–719'), 'a table is rows of cells, the rule line is gone');
  assert.ok(out.includes('<b>Сцена.</b> Барбер <code>стрижёт</code> &lt;всех&gt; &amp; обучает.'), 'bold and code, everything else escaped');
  assert.ok(out.includes('<pre>no   :: Вашу карточку я удалила.</pre>'), 'a fenced block is pre');
  assert.ok(!out.includes('Closes #405'), 'Closes lines are dropped');
  assert.ok(!out.includes('\n\n\n'), 'blank runs collapse');

  // The whole thing survives the clamp with its tags balanced.
  const card = render({ type: 'issue', project: 'arvent', action: 'opened', number: 1, title: 't', body: body.repeat(40), url: 'https://x/i/1' });
  assert.ok(card.length <= 4096);
  assert.ok(card.includes('<blockquote expandable>'), 'a long body collapses');
});

test('card/incident: every line of the diagnosis survives', () => {
  const out = render({
    type: 'incident', project: 'vault', title: 'Vault needs a fix',
    detail: 'нет sops\nключ не найден\nлог: ~/Library/Logs/vault.log',
    logs: '~/Library/Logs/vault.log'
  });

  assert.equal(out, [
    '#incident #vault_needs_a_fix #fail',
    '🚨 <b>Incident (Vault):</b> Vault needs a fix',
    '<blockquote>нет sops',
    'ключ не найден',
    'лог: ~/Library/Logs/vault.log</blockquote>',
    '',
    '<b>Log:</b> <code>~/Library/Logs/vault.log</code>'
  ].join('\n'));
});

test('card/incident: several independent findings become a named list, not one glued blockquote', () => {
  const out = render({
    type: 'incident', project: 'vault', title: 'The vault needs repair',
    items: [
      { text: 'DIVERGED: notify.OPS_BOT_TOKEN — the vault holds one value, the disk another', group: 'Findings' },
      { text: 'STALE IN ARCHIVE: ssh-keys.tar.gz.age', group: 'Findings' },
      { text: 'BAD only one recipient: losing the key loses the whole vault', group: 'Findings' }
    ],
    logs: '~/Library/Logs/vault-selfcheck-fail.log'
  });

  assert.equal(out, [
    '#incident #the_vault_needs_repair #fail',
    '🚨 <b>Incident (Vault):</b> The vault needs repair',
    '',
    '<i><u>Findings</u></i>',
    '• DIVERGED: notify.OPS_BOT_TOKEN — the vault holds one value, the disk another',
    '• STALE IN ARCHIVE: ssh-keys.tar.gz.age',
    '• BAD only one recipient: losing the key loses the whole vault',
    '',
    '<b>Log:</b> <code>~/Library/Logs/vault-selfcheck-fail.log</code>'
  ].join('\n'));
});

test('card/heartbeat miss', () => {
  const out = render({
    type: 'heartbeat_miss', project: 'playhub', job: 'Yandex game import',
    expected: 'at least once every 26h', lastSeen: 'never'
  });

  assert.equal(out, [
    '#heartbeat #yandex_game_import #unknown',
    '❓ <b>Heartbeat (Silent):</b> Yandex game import',
    '',
    '<i><u>Schedule</u></i>',
    '<b>Expected:</b> at least once every 26h',
    '<b>Last seen:</b> never'
  ].join('\n'));
});

test('card with a file: the caption is clamped at 1024, not 4000', () => {
  const out = render({
    type: 'job', project: 'arvent', job: 'Eval: bot answer quality', status: 'ok',
    key: 'arvent-eval', path: '/tmp/x.txt', note: 'Ц'.repeat(4000)
  });

  assert.ok(out.length <= 1024, `caption ${out.length} chars — Telegram cuts at 1024`);
  assert.ok(out.startsWith('#job #arvent_eval #ok\n✅ <b>Job (OK):</b> Eval: bot answer quality'),
    'a card carrying a file is still the card of its own type');
});

test('the same card without a file gets the full 4000', () => {
  const out = render({
    type: 'job', project: 'arvent', job: 'Eval: bot answer quality', status: 'ok',
    key: 'arvent-eval', note: 'Ц'.repeat(4000)
  });

  assert.ok(out.length > 1024, 'a card with no attachment must not be cut to caption size');
});

test('card/report', () => {
  const out = render({
    type: 'report', project: 'playhub', title: 'Analytics', aside: 'compared to 23.08',
    lines: [['Pageviews (server)', '1284'], ['Game launches', '412']],
    items: [{ text: 'query — 12 clicks', url: 'https://x/q' }]
  });

  assert.equal(out, [
    '#report #analytics #info',
    'ℹ️ <b>Report (compared to 23.08):</b> Analytics',
    // Ungrouped rows stand flush against the header: they are facts about the
    // report itself.
    '<b>Pageviews (server):</b> 1284',
    '<b>Game launches:</b> 412',
    '',
    '• <a href="https://x/q">query — 12 clicks</a>'
  ].join('\n'));
});

// What a report covers is part of its NAME, not another fact about it: as a row
// of its own it read as a number among numbers, and only this one report ever
// had that row. In brackets on the type line every report says the same thing
// the same way.
test('report: what it covers rides in brackets on the name itself', () => {
  const out = render({
    type: 'report', project: 'playhub', key: 'daily', title: 'russkie-igry.ru',
    aside: '2026-08-25', lines: [['Games', 412, 'Catalogue']]
  });
  const rows = out.split('\n');

  assert.equal(rows[1], 'ℹ️ <b>Report (2026-08-25):</b> russkie-igry.ru');
  assert.ok(!out.includes('<b>Period:</b>'), 'the Period row came back');
  assert.equal(rows[2], '');
  assert.ok(rows.includes('<i><u>Catalogue</u></i>'));
});

test('fieldLink: a multi-line value does not become multi-line link text', () => {
  // arvent's nightly workflow passes a two-line `commit`. `fieldLink` skipped
  // the first-line trim that `field` applies, so both lines ended up inside the
  // <a> tag.
  const out = render({
    type: 'ci', project: 'arvent', status: 'ok',
    commit: 'ночная проверка master\nполная проверка: success',
    commitUrl: 'https://x/c'
  });

  assert.ok(out.includes('>ночная проверка master…</a>'), 'link text not trimmed to one line');
  assert.ok(!out.includes('полная проверка'), 'second line leaked into the link');
});

test('clampMessage closes nested tags in the order they were opened', () => {
  // A fixed close-order list made `<i><u>` come back as `</i></u>`: the tag
  // counts balance, so a counting test stays green, but the nesting is broken
  // and Telegram answers 400 — the whole card is lost. A report whose group
  // heading is long enough to be cut inside `<u>` reproduces it.
  const clamped = clampMessage(`head\n<i><u>${'G'.repeat(5000)}</u></i>\ntail`, 200);

  assert.ok(!clamped.includes('</i></u>'), 'inner tag closed after the outer one');
  assert.ok(clamped.includes('</u></i>'), 'the tail did not close both tags');
  // Counting tags is what let this through, so check the NESTING with a stack.
  const wellFormed = (s: string): boolean => {
    const stack: string[] = [];
    for (const m of s.matchAll(/<(\/?)(b|a|i|u|code|pre|blockquote)[ >]/g)) {
      if (m[1] === '/') {
        if (stack.pop() !== m[2]) {
          return false;
        }
      } else {
        stack.push(m[2]);
      }
    }

    return stack.length === 0;
  };

  // The checker must be able to say no, or its yes means nothing.
  assert.equal(wellFormed('<i><u>x</i></u>'), false, 'the nesting check cannot fail');
  assert.equal(wellFormed('<i><u>x</u></i>'), true, 'the nesting check rejects valid markup');
  assert.ok(wellFormed(clamped), 'the clamped body is not well-formed');
});

test('clampMessage never leaves an <a> tag open when its closing `>` sits past the cut point', () => {
  // Found by GLM review 2026-08-26: the guard used to search for the closing
  // `>` across the WHOLE slice up to `limit`, not up to the line-boundary cut
  // point (`end`). A tag whose `>` landed between `end` and `limit` read as
  // "closed" and the cut sliced straight through the middle of the `href`
  // anyway — Telegram answers 400 to the result, the whole card is lost.
  const filler = 'x'.repeat(2500);
  const tag = '<a href="https://example.com/aaa\nbbb">link</a>';
  const clamped = clampMessage(filler + tag + 'z'.repeat(2000), 4000);

  assert.ok(!/<a\b[^>]*<\//.test(clamped), 'an <a> tag was cut open before its own `>`');
});


// ── The link rides on the name, never on a bare verb ────────────────────────
// The owner read `Details: open` under a daily report and asked what "open"
// meant. It meant the report — which was printed three lines above as dead
// text. These four tests fail if any card goes back to that shape.

test('link/report: the report name is the link, and there is no Details row', () => {
  const out = render({
    type: 'report', project: 'game-publisher', title: 'Analytics for 2026-08-22',
    aside: 'compared with 2026-08-21',
    lines: [['Humans in the server log', '262 ▲23']],
    url: 'https://github.com/sazanwork/game-publisher/blob/master/docs/analytics/2026-08-22.md'
  });

  assert.ok(
    out.includes('ℹ️ <b>Report (compared with 2026-08-21):</b> <a href="https://github.com/sazanwork/game-publisher/blob/master/docs/analytics/2026-08-22.md">Analytics for 2026-08-22</a>'),
    'the report name is the link and keeps its brackets'
  );
  assert.ok(!out.includes('<b>Source:</b>'), '`Source: report` under a card headed Report named nothing');
  assert.ok(
    !out.includes('<b>Period:</b>'),
    'what the report covers must ride on the name, not take a row of its own'
  );
  assert.ok(!out.includes('2026-08-22 · '), 'the middot pair on the type line came back');
  assert.ok(!out.includes('Details'), 'the Details row came back');
  assert.ok(!out.includes('>open</a>'), 'a bare "open" link came back');
});

test('link/report with groups: same rule', () => {
  const out = render({
    type: 'report', project: 'mac-config', title: 'Board',
    groups: [{ name: 'Ready', items: [{ text: '#12 do a thing', url: 'https://x/12' }] }],
    url: 'https://x/board'
  });

  assert.ok(out.includes('<b>Report:</b> <a href="https://x/board">Board</a>'), 'grouped report lost its name or its link');
  assert.ok(!out.includes('<b>Source:</b>'), 'the Source row is gone');
  assert.ok(!out.includes('Details'), 'the Details row came back in the grouped report');
});

test('link/job: the task name is the link, not a trailing Workflow: open', () => {
  const out = render({
    type: 'job', project: 'playhub', job: 'Yandex game import', status: 'fail',
    note: 'Yandex returned no games at all',
    url: 'https://github.com/sazanwork/playhub/actions/runs/42'
  });

  assert.ok(
    out.includes('<b>Job (Fail):</b> <a href="https://github.com/sazanwork/playhub/actions/runs/42">Yandex game import</a>'),
    'the task name is the link'
  );
  assert.ok(!out.includes('<b>Source:</b>'), 'the Source row is gone');
  assert.ok(!out.includes('>open</a>'), 'the bare Workflow: open row came back');
});

test('link/job: the workflow row is gone — it was line 2 written twice', () => {
  const out = render({
    type: 'job', project: 'playhub', job: 'Game validator', status: 'ok',
    url: 'https://x/run', workflowName: 'validate-games.yml', workflowUrl: 'https://x/wf'
  });

  // `workflowUrl` beats `url` on the name.
  assert.ok(out.includes('<b>Job (OK):</b> <a href="https://x/wf">Game validator</a>'), 'the name must link to workflowUrl');
  assert.ok(!out.includes('<b>Workflow:</b>'), 'the duplicate destination came back');
});

test('link/incident: the title is the link', () => {
  const out = render({
    type: 'incident', project: 'vault', title: 'The vault needs repair',
    detail: 'three lines of diagnosis', url: 'https://x/run'
  });

  assert.ok(
    out.includes('🚨 <b>Incident (Vault):</b> <a href="https://x/run">The vault needs repair</a>'),
    'the incident title is the link on the type line'
  );
  assert.ok(!out.includes('<b>Source:</b>'), 'the Source row is gone');
  assert.ok(!out.includes('<b>Title:</b>'), 'the Title row came back on the incident');
  assert.ok(!out.includes('>open</a>'), 'the bare open link came back on the incident');
});

test('link/no url: the name stays plain text, the card does not invent a link', () => {
  const out = render({ type: 'report', project: 'vault', title: 'Keys', lines: [['Total', 3]] });
  assert.ok(out.includes('ℹ️ <b>Report:</b> Keys'), 'report without a url lost its name');
  assert.ok(!out.includes('<a href'), 'a link appeared out of nowhere');
});

test('link/job: a command he must run is monospaced, so Telegram makes it copyable', () => {
  const out = render({
    type: 'job', project: 'mac-config', job: 'Session is burning the limit', status: 'fail',
    note: 'context 871k against a compact line of 500k',
    stats: [['Session', 'Пройди на Хекслете следующие темы']],
    command: 'claude --resume 8f03d18c-b7d6-438c-bb40-6756c3e1e835',
    commandNote: 'reopen this session to look at it'
  });

  assert.ok(out.includes('<code>claude --resume 8f03d18c-b7d6-438c-bb40-6756c3e1e835</code>'),
    'the command is not monospaced');
  assert.ok(out.includes('<b>Session:</b> Пройди на Хекслете следующие темы'), 'the session name was dropped');
});

// ── A session in trouble is not a job ───────────────────────────────────────
// It went out under `#job` first. The owner asked what a burning session was
// doing under a heading that promises something scheduled, and he was right.

test('card/session: identifier first, his own words quoted, command copyable', () => {
  const out = render({
    type: 'session', project: 'mac-config', action: 'burning the limit', status: 'fail',
    id: '8f03d18c-b7d6-438c-bb40-6756c3e1e835',
    workdir: 'mac-config',
    reason: 'context 871596 against a compact line of 500000, cache rewrites: 5 of the last 30 requests',
    opened: 'Пройди на Хекслете (ru.hexlet.io) по очереди эти темы из «Мои темы»',
    command: 'rm /var/folders/x/claude-ctxguard/8f03d18c.latch',
    commandNote: 'stop the alarm for this session'
  });

  assert.equal(out, [
    '#incident #burning_the_limit #fail',
    '🚨 <b>Incident (Session):</b> Claude session is burning the limit',
    '<b>Project:</b> mac-config',
    '<b>Reason:</b> context 871596 against a compact line of 500000, cache rewrites: 5 of the last 30 requests',
    '',
    // A bold field label, nothing after the colon — not the group() heading:
    // a group means a list, and there is only ever one quote here.
    '<b>Opened with:</b>',
    '<blockquote>Пройди на Хекслете (ru.hexlet.io) по очереди эти темы из «Мои темы»</blockquote>',
    '',
    '<b>To do:</b> stop the alarm for this session',
    '<code>rm /var/folders/x/claude-ctxguard/8f03d18c.latch</code>'
  ].join('\n'));
});

test('card/session: the opening line is NOT clipped to one line the way a field is', () => {
  const long = 'Пройди на Хекслете следующие темы по списку:\nсначала одну,\nпотом вторую';
  const out = render({
    type: 'session', project: 'mac-config', action: 'burning the limit', opened: long
  });

  assert.ok(out.includes('потом вторую'), 'the last line of his own text was cut off');
  assert.ok(!out.includes('…'), 'the opening line was clipped like a field');
});

test('card/session: a red session rings, and its tag does not change every session', () => {
  const one = render({ type: 'session', project: 'mac-config', action: 'burning the limit', id: 'aaa' });
  const two = render({ type: 'session', project: 'mac-config', action: 'burning the limit', id: 'bbb' });

  assert.ok(one.startsWith('#incident #burning_the_limit'), 'wrong tag');
  assert.ok(!one.includes('#session'), 'the retired #session tag came back');
  assert.equal(one.split('\n')[0], two.split('\n')[0], 'the tag changed with the session id');
  // A session is an incident: one state, one sound. `status: 'ok'` is still
  // ACCEPTED from the old sender and is simply not read any more.
  assert.equal(severity({ type: 'session', project: 'mac-config', action: 'x', status: 'fail' }), 'error');
  assert.equal(severity({ type: 'session', project: 'mac-config', action: 'x', status: 'ok' }), 'error');
});

// The `session` type was folded into `incident` on 03.09.2026: two cards said
// one thing — something is stuck and waits for you — under two names and the
// same 🚨. The type is still ACCEPTED, because the runaway guard on this Mac
// (`context-runaway-notify.sh`) sends exactly it; it renders as an incident,
// and `#session` is never printed again.
test('card/session: the folded type renders as an incident, tag and all', () => {
  const folded = render({
    type: 'session', project: 'mac-config', key: 'context-runaway',
    action: 'burning the limit'
  });

  assert.equal(folded.split('\n')[0], '#incident #context_runaway #fail');
  assert.equal(folded.split('\n')[1], '🚨 <b>Incident (Session):</b> Claude session is burning the limit');
  // No bracket on an incident: it has exactly one state, so the word would
  // say nothing. What burns is the NAME after the colon.
  assert.ok(folded.includes('<b>Incident (Session):</b>'), 'the bracket names the place, not an outcome');

  // An incident sent directly is the same card, and it carries the rows the
  // session card used to own.
  const direct = render({
    type: 'incident', project: 'mac-config', key: 'context-runaway',
    title: 'Claude session is burning the limit',
    workdir: 'arvent', reason: 'context 871596 against 500000',
    opened: 'fix the login form', command: 'rm /tmp/x.latch', commandNote: 'unlock it'
  });

  assert.ok(direct.includes('<b>Project:</b> arvent'), direct);
  assert.ok(direct.includes('<b>Opened with:</b>'), direct);
  assert.ok(direct.includes('<code>rm /tmp/x.latch</code>'), direct);

  // With no action at all the card still names what it is about.
  const bare = render({ type: 'session', project: 'mac-config', action: '' });
  assert.equal(bare.split('\n')[1], '🚨 <b>Incident (Session):</b> Claude session is in trouble');
});

test('card/job: facts get their own lines instead of one run-on Reason', () => {
  const out = render({
    type: 'job', project: 'mac-config', job: 'Server backups', status: 'fail',
    stats: [['Fresh copies', 10], ['Broken', 1]],
    note: 're-downloading from the server did not help, there is nothing to roll back to',
    logs: '~/Library/Logs/pull-vps-backups.log'
  });

  assert.equal(out, [
    '#job #server_backups #fail',
    '🔴 <b>Job (Fail):</b> Server backups',
    '<b>Reason:</b> re-downloading from the server did not help, there is nothing to roll back to',
    '<b>Fresh copies:</b> 10',
    '<b>Broken:</b> 1',
    '',
    '<b>Log:</b> <code>~/Library/Logs/pull-vps-backups.log</code>'
  ].join('\n'));
});

test('card/job: several red checks are a list, not a comma-separated tail', () => {
  const out = render({
    type: 'job', project: 'mac-config', job: 'Config checks', status: 'fail',
    note: '2 checks are red',
    items: [{ text: 'test-update-all' }, { text: 'check-notify-flags' }],
    logs: '/Users/chelsnebes/Library/Logs/update-all.log'
  });

  assert.ok(out.includes('• test-update-all\n• check-notify-flags'), 'the red checks did not become a list');
  assert.ok(!out.includes('Disabled workflows'), 'the disabled heading leaked onto a plain list');
  assert.ok(out.includes('<b>Log:</b> <code>/Users/chelsnebes/Library/Logs/update-all.log</code>'), 'the log path is not monospaced');
});

// ── Silence is a state of the task, not a separate species ──────────────────
// It used to be its own event type, `heartbeat_miss`, and the owner asked why a
// scheduled task lived under two different tags. Worse: the watchdog passes the
// SAME machine key as the task itself, so a red `#heartbeat #daily_import`
// could never be closed by a green `#job #daily_import` — the reactor pairs on
// the whole tag line.

test('card/job silent: one task, one tag, and the pair closes', () => {
  const gone = render({
    type: 'job', project: 'playhub', key: 'daily-import', job: 'Yandex game import',
    status: 'silent', expected: 'at least once every 26h', lastSeen: '23.08 04:12'
  });
  const back = render({
    type: 'job', project: 'playhub', key: 'daily-import', job: 'Yandex game import',
    status: 'ok', expected: 'at least once every 26h', lastSeen: '25.08 04:10'
  });

  // `#unknown`, not `#fail`: nobody knows yet whether it broke or simply did
  // not run. That is exactly what the ❓ says, and the tag says it too.
  assert.equal(gone.split('\n')[0], '#job #daily_import #unknown');
  // The INSTANCE tag is what matches, not the whole line: the third tag is the
  // outcome and differs by definition between a red card and the green one
  // that closes it. The pair is found by tapping `#daily_import`.
  assert.equal(
    gone.split('\n')[0].split(' ')[1],
    back.split('\n')[0].split(' ')[1],
    'the pair does not share an instance tag'
  );
  assert.equal(gone.split('\n')[0].split(' ')[2], '#unknown');
  assert.equal(back.split('\n')[0].split(' ')[2], '#ok');
  assert.ok(gone.includes('❓ <b>Job (Silent):</b> Yandex game import'), 'silence has lost its own icon');
  // No `State:` row anywhere. It repeated in words what the icon and the third
  // tag both already say.
  assert.ok(!gone.includes('<b>State:</b>'), 'the State row came back');
  assert.ok(!back.includes('<b>State:</b>'), 'the State row came back on the green card');
  assert.ok(gone.includes('<b>Last seen:</b> 23.08 04:12'), 'a silent task must say when it was last seen');
  assert.ok(back.includes('<b>Last run:</b> 25.08 04:10'), 'a live task says last RUN, not last seen');
  assert.equal(severity({ type: 'job', project: 'playhub', job: 'x', status: 'silent' }), 'error');
});

test('severity: every status that is not ok rings', () => {
  for (const status of ['fail', 'disabled', 'silent'] as const) {
    assert.equal(
      severity({ type: 'job', project: 'playhub', job: 'x', status }), 'error',
      `${status} arrived muted`
    );
  }
  assert.equal(severity({ type: 'job', project: 'playhub', job: 'x', status: 'ok' }), 'info');
});

// ── The icon decides the sound, and nothing else does ───────────────────────
// Two lists — one of icons, one of "which events are bad" — is how
// `🔴 PR: changes_requested` became the only red card in the package that
// arrived MUTED: severity() looked at `status`, and a pull request has an
// `action`.

test('sound: every red or alarm card rings, and only those', () => {
  const P = { project: 'playhub' } as const;
  const all: NotifyEvent[] = [
    { type: 'deploy', ...P, status: 'ok' },
    { type: 'deploy', ...P, status: 'fail' },
    { type: 'ci', ...P, status: 'ok' },
    { type: 'ci', ...P, status: 'fail' },
    { type: 'job', ...P, job: 'x', status: 'ok' },
    { type: 'job', ...P, job: 'x', status: 'fail' },
    { type: 'job', ...P, job: 'x', status: 'disabled' },
    { type: 'job', ...P, job: 'x', status: 'silent' },
    { type: 'report', ...P, title: 'T' },
    { type: 'incident', ...P, title: 'T' },
    { type: 'session', ...P, action: 'burning', status: 'fail' },
    { type: 'session', ...P, action: 'calm', status: 'ok' },
    { type: 'issue', ...P, action: 'opened', number: 1, title: 'T' },
    { type: 'issue', ...P, action: 'assigned', number: 1, title: 'T' },
    { type: 'issue', ...P, action: 'closed', number: 1, title: 'T' },
    { type: 'pr', ...P, action: 'opened', number: 1, title: 'T' },
    { type: 'pr', ...P, action: 'closed', number: 1, title: 'T' },
    { type: 'pr', ...P, action: 'merged', number: 1, title: 'T' },
    { type: 'pr', ...P, action: 'approved', number: 1, title: 'T' },
    { type: 'pr', ...P, action: 'changes_requested', number: 1, title: 'T' },
    { type: 'report', ...P, title: 'T', path: '/tmp/x' },
    { type: 'heartbeat_miss', ...P, job: 'x' },
    { type: 'heartbeat_miss', ...P, job: 'x', recovered: true }
  ];

  // The sound belongs to the ICON, so the expectation is written as the icon
  // list — not as a second opinion about which events are bad.
  const LOUD = ['🔴', '🚨', '🚫', '❓'];

  for (const e of all) {
    const line = render(e).split('\n')[1];
    const icon = Object.values(ICON).find((i) => line.startsWith(i));
    assert.ok(icon, `${e.type}: line 2 starts with an icon that is not in the vocabulary — ${line}`);
    assert.equal(
      severity(e), LOUD.includes(icon as string) ? 'error' : 'info',
      `${e.type} "${line.replace(/<[^>]+>/g, '')}" — icon and sound disagree`
    );
  }
});

/**
 * This used to assert the opposite. The bug it was written for was real — the
 * icon said red and the sound said quiet, two lists disagreeing — but the fix
 * went the wrong way. The owner settled it on 25.08.2026: a reviewer asking for
 * edits is not a failure and has no business waking him at night. It is the
 * ICON that was wrong, not the silence.
 */
test('sound: a review asking for edits does not ring', () => {
  const e: NotifyEvent = {
    type: 'pr', project: 'playhub', action: 'changes_requested', number: 1, title: 'T'
  };
  assert.ok(render(e).split('\n')[1].startsWith('📝'), 'changes_requested is not a breakage');
  assert.equal(severity(e), 'info', 'a request for edits started ringing again');
});

/**
 * The action line is the only line that asks something OF HIM. Two reviews on
 * 25.08.2026 rejected group headings for a six-line card and agreed on this
 * instead: one marker, no extra lines. The invariant the test protects is that
 * the line is findable — marked, monospaced, and last.
 */
test('action: the line he must run is marked and copyable; the pointer block is last (v2.1)', () => {
  const out = render({
    type: 'job', project: 'mac-config', job: 'Config checks', status: 'fail',
    note: 'red: test-update-all', logs: '/Users/x/Library/Logs/update-all.log',
    command: 'bash ~/bin/update-all --tests-only',
    commandNote: 'rerun the suite and read the log'
  });
  const lines = out.split('\n').filter(Boolean);

  assert.ok(out.includes('<b>To do:</b> rerun the suite and read the log'),
    'a command must never travel without saying what it does');
  // The command has no marker of its own, and must not have one: the
  // monospaced line under `To do:` IS the command — Telegram makes it copyable on tap.
  assert.ok(!out.includes('▶'), 'the command grew a marker back');
  assert.ok(out.includes('<code>bash ~/bin/update-all --tests-only</code>'), 'the command lost its copyable box');
  // Where to verify is the card's LAST block now (rule S): the Log path
  // moved out of the body so a cut can never take it.
  assert.equal(lines.at(-1), '<b>Log:</b> <code>/Users/x/Library/Logs/update-all.log</code>',
    'the pointer block must close the card');
});

/**
 * The owner, about a bare command in a card: "I will type it in right now
 * and do who-knows-what, I don't even know what I'm doing." A command that
 * cannot be read also cannot be run — so it never travels alone.
 */
test('action: a command never travels without saying what it does', () => {
  const bare = render({
    type: 'job', project: 'mac-config', job: 'x', status: 'fail',
    command: 'rm /tmp/x.latch'
  });

  assert.ok(!bare.includes('<code>'), 'a command with no note must not be shown at all');

  const explained = render({
    type: 'job', project: 'mac-config', job: 'x', status: 'fail',
    command: 'rm /tmp/x.latch', commandNote: 'stop the alarm for this session'
  });
  const lines = explained.split('\n').filter(Boolean);

  assert.equal(lines.at(-2), '<b>To do:</b> stop the alarm for this session');
  assert.equal(lines.at(-1), '<code>rm /tmp/x.latch</code>');
});

test('action: a card with nothing to run carries no marker', () => {
  const out = render({
    type: 'job', project: 'mac-config', job: 'Server backups', status: 'fail',
    note: 'fresh copies: 10, broken: 1'
  });

  assert.ok(!out.includes('<code>'), 'a card with no action must not show a command');
});


test('sound: nothing a pull request does ever rings', () => {
  const actions = ['opened', 'approved', 'changes_requested', 'merged', 'closed'] as const;

  for (const action of actions) {
    assert.equal(
      severity({ type: 'pr', project: 'playhub', action, number: 1, title: 'T' }), 'info',
      `pr ${action} rings — a pull request is never an emergency`
    );
  }
});

test('list items: a named group always prints its heading, unnamed ones go above', () => {
  const out = render({
    type: 'job',
    project: 'playhub',
    job: 'Yandex game import',
    status: 'ok',
    items: [
      { text: 'без группы' },
      { text: 'Cut the Rope', group: 'New today' },
      { text: 'Bloxorz', group: 'Out of the backlog' },
      { text: 'Vex 7', group: 'New today' }
    ]
  });

  const at = (s: string): number => out.indexOf(s);

  assert.ok(at('без группы') < at('New today'), 'an unnamed item must stand above the first group');
  assert.ok(at('New today') < at('Cut the Rope'), 'the group heading stands before its items');
  assert.ok(at('Cut the Rope') < at('Vex 7'), 'items of one group are gathered together');
  assert.ok(at('Vex 7') < at('Out of the backlog'), 'the second group comes fully after the first');
  assert.equal(out.split('New today').length - 1, 1, 'the group heading is printed exactly once');
});

test('list items: with no group at all the list stays flat, as it did for earlier senders', () => {
  const out = render({
    type: 'job',
    project: 'playhub',
    job: 'x',
    status: 'fail',
    items: [{ text: 'один' }, { text: 'два' }]
  });

  assert.ok(out.includes('• один'));
  assert.ok(out.includes('• два'));
  assert.ok(!out.includes('<i><u>'), 'with no groups there must be no headings');
});

test('list items: an item with facts becomes a nested list — a bullet, then indented sub-rows', () => {
  const out = render({
    type: 'report',
    project: 'playhub',
    title: 'Weekly analytics',
    groups: [{
      name: 'Top search queries',
      items: [
        { text: '"online games ru"', facts: [['Clicks', 2], ['Position', 55]] },
        { text: '"online games russian"', facts: [['Clicks', 1], ['Position', 59]] }
      ]
    }]
  });

  assert.equal(out, [
    '#report #weekly_analytics #info',
    'ℹ️ <b>Report:</b> Weekly analytics',
    '',
    '<i><u>Top search queries</u></i>',
    '• &quot;online games ru&quot;',
    '   <b>Clicks:</b> 2',
    '   <b>Position:</b> 55',
    '• &quot;online games russian&quot;',
    '   <b>Clicks:</b> 1',
    '   <b>Position:</b> 59'
  ].join('\n'));
});

test('list items: a labelled item is capitalized, same as a field and a fact', () => {
  // Found in review 2026-08-26 (his own bug report, via GLM): `groupItem`
  // bolded the label but skipped `cap()` — the one label shape on the whole
  // card that did not follow the "first letter capitalized" rule every field
  // and every fact already follow.
  const out = render({
    type: 'incident', project: 'vault', title: 'The vault needs repair',
    items: [{ text: 'ssh-keys.tar.gz.age', label: 'stale in archive' }]
  });

  assert.ok(out.includes('<b>Stale in archive:</b> ssh-keys.tar.gz.age'));
});

// ── One number, one shape ───────────────────────────────────────────────────

test('trend: both numbers, old on the left, new on the right, an arrow only where there is a second one', () => {
  // Old first, new second — read left to right as "was, became, by how much".
  // The owner read `51 ▲5` first and asked what the 5 was: the distance
  // between two numbers, only one of which the card showed.
  assert.equal(trend(210, 207), '207 / 210 ▲3');
  assert.equal(trend(202, 207), '207 / 202 ▼5');
  assert.equal(trend(0, 0), '0 / 0 =');
  // Nothing to compare to: a plain number, never a `+37` that looks like one.
  assert.equal(trend(37), '37');
  assert.equal(trend(37, undefined), '37');
  // The unit belongs to both numbers, and the arrow stands right of the pair.
  assert.equal(trend(4.4, 3.6, '%'), '3.6% / 4.4% ▲0.8');
  // Noise in the second decimal is not movement.
  assert.equal(trend(4.42, 4.44, '%'), '4.4% / 4.4% =');
  // Found by Codex review 2026-08-26: raw values 0.02 apart round to
  // DIFFERENT printed labels (4.4% vs 4.5%) — `=` next to two different
  // numbers is a lie the reader can see with their own eyes.
  assert.equal(trend(4.46, 4.44, '%'), '4.4% / 4.5% ▲0.1');
  assert.equal(trend(4.44, 4.46, '%'), '4.5% / 4.4% ▼0.1');
  // No sender may print the other dialect: a signed count is not a comparison.
  for (const out of [trend(210, 207), trend(37), trend(0, 0)]) {
    assert.ok(!/[+]/.test(out), `a plus sign came back: ${out}`);
  }
});

// ── One icon meaning, one tag ───────────────────────────────────────────────

test('tags: the third tag follows the icon, and off is not fail', () => {
  const tagOf = (e: NotifyEvent): string => render(e).split('\n')[0].split(' ')[2];
  const job = (status: 'ok' | 'fail' | 'disabled' | 'silent'): NotifyEvent => ({
    type: 'job', project: 'playhub', job: 'x', status
  });

  assert.equal(tagOf(job('ok')), '#ok');
  assert.equal(tagOf(job('fail')), '#fail');
  // The two the owner asked for by name: a watchdog that switched something
  // off did not break, and a task that has gone quiet may be perfectly fine.
  assert.equal(tagOf(job('disabled')), '#off');
  assert.equal(tagOf(job('silent')), '#unknown');

  // All four still ring. The sound is the icon's, and splitting the tags did
  // not quietly take one of them off the alarm list.
  for (const status of ['fail', 'disabled', 'silent'] as const) {
    assert.equal(severity(job(status)), 'error', `${status} stopped ringing`);
  }

  // The whole vocabulary is five words and no more: a sixth would be a filter
  // he never asked for, and a missing one would file two meanings together.
  const words = new Set(Object.values(ICON).map((i) => OUTCOME_TAG[i] ?? 'info'));
  assert.deepEqual([...words].sort(), ['fail', 'info', 'off', 'ok', 'unknown']);
  assert.notEqual(OUTCOME_TAG[ICON.off], OUTCOME_TAG[ICON.red], 'off is filed as a failure again');
  assert.notEqual(OUTCOME_TAG[ICON.unknown], OUTCOME_TAG[ICON.red], 'silence is filed as a failure again');
});

test('reason: one line stays a field, several lines become a captioned quote — nothing is cut silently (v2.1)', () => {
  const short = render({ type: 'job', project: 'playhub', job: 'Backups', status: 'fail',
    note: 'connect timed out', check: 'config jobs --log backups' });

  assert.ok(short.includes('<b>Reason:</b> connect timed out'), 'a one-line reason must stay inline');
  assert.ok(!short.includes('<blockquote>connect'), 'a one-line reason must not become a quote');

  const long = render({ type: 'job', project: 'playhub', job: 'Backups', status: 'fail',
    note: 'scp: connect to host timed out\nretry 2/3 failed, giving up\nlast good backup: 29.08',
    check: 'config jobs --log backups' });

  assert.ok(long.includes('<b>Reason:</b>\n<blockquote>scp: connect to host timed out\nretry 2/3 failed, giving up\nlast good backup: 29.08</blockquote>'),
    `every line of the reason must survive:\n${long}`);
});

test('cut marker: names the log when there is one, and the card still fits (v2.1)', () => {
  const long = Array.from({ length: 800 }, (_, i) => `finding number ${i} with some length to it`).join('\n');
  const out = render({ type: 'job', project: 'playhub', job: 'Validator', status: 'fail',
    note: long, logs: '~/Library/Logs/validator.log', check: 'config jobs --log validator' });

  assert.ok(out.length <= 4096, `over the limit: ${out.length}`);
  // The marker NAMES the row, it does not repeat its value: printing the path
  // here put the same path on two consecutive lines, the marker and `Log:`.
  assert.ok(out.includes('⋯ cut, full text at Log below'), 'the marker must name where the full text lives');
  assert.equal((out.match(/~\/Library\/Logs\/validator\.log/g) ?? []).length, 1, 'the log path is printed twice');
  // The pointer block survives the cut — that is the whole point of tail-first assembly.
  assert.ok(out.includes('<b>Check:</b> <code>config jobs --log validator</code>'), 'the cut took the Check row');
  assert.ok(out.includes('<b>Log:</b>'), 'the cut took the Log row');
});

test('cut marker: with no log, a cut card points at the link on line 2', () => {
  // The owner met a bare `⋯ cut` on a live PR card and asked what the three
  // dots referred to. The card carried a link the whole time — the rest was
  // one tap away and the marker never said so.
  const long = Array.from({ length: 900 }, (_, i) => `описание строки ${i}, довольно длинное`).join(' ');
  const out = render({ type: 'pr', project: 'arvent', action: 'merged', number: 315,
    title: 'Лист ожидания', body: long, url: 'https://x/p/315' });

  assert.ok(out.includes('⋯ cut, full text behind the link on line 2'));
  assert.ok(out.includes('<a href="https://x/p/315">#315</a>'));
  assert.ok(out.length <= 4096, `over the limit: ${out.length}`);

  // Nothing to point at: the marker says only that something was cut, because
  // promising a link that is not there is worse than saying nothing.
  const nowhere = render({ type: 'pr', project: 'arvent', action: 'merged', number: 315,
    title: 'Лист ожидания', body: long });
  assert.ok(nowhere.includes('⋯ cut'));
  assert.ok(!nowhere.includes('behind the link'), 'promised a link that does not exist');
});

test('zero rows: a zero that did not move is not printed, and a group left empty loses its heading', () => {
  const report = render({
    type: 'report', project: 'game-publisher', title: 'Analytics, daily',
    lines: [
      ['People', '190 / 215 ▼25', 'Server log'],
      ['Game plays', '0 / 0 =', 'GA4'],
      ['People', '0 / 0 =', 'GA4'],
      ['Clicks', '0 / 0 =', 'Google Search'],
      ['Impressions', '3 / 1 ▲2', 'Google Search'],
      ['Visible', '0% / 0% =', 'Coverage']
    ]
  });

  assert.ok(report.includes('<b>People:</b> 190 / 215 ▼25'));
  assert.ok(report.includes('<b>Impressions:</b> 3 / 1 ▲2'));
  assert.ok(!report.includes('0 / 0 ='), 'a zero against a zero says nothing');
  assert.ok(!report.includes('<i><u>GA4</u></i>'), 'a group with no rows left has no heading');
  assert.ok(!report.includes('<i><u>Coverage</u></i>'));
  assert.ok(report.includes('<i><u>Google Search</u></i>'), 'a group with one live row keeps its heading');

  const job = render({
    type: 'job', project: 'playhub', job: 'Game liveness check', status: 'ok',
    stats: [['Checked', 1326], ['404 during scan', 0], ['Confirmed dead', 0], ['Featured lost', '0 / 3 ▼3']]
  });
  assert.ok(job.includes('<b>Checked:</b> 1326'));
  assert.ok(!job.includes('404 during scan'), 'a bare zero is silence');
  assert.ok(job.includes('<b>Featured lost:</b> 0 / 3 ▼3'), 'a zero that CHANGED is news');

  const facts = render({
    type: 'report', project: 'playhub', title: 'Analytics',
    groups: [{ name: 'Top search queries', items: [{ text: '"russian game online"', facts: [['Clicks', 0], ['Position', 65]] }] }]
  });
  assert.ok(!facts.includes('<b>Clicks:</b> 0'), 'a zero fact under an item is silence too');
  assert.ok(facts.includes('<b>Position:</b> 65'));
});

test('cut marker: a caption card announces the attachment as the full text and fits 1024 (v2.1)', () => {
  const long = Array.from({ length: 200 }, (_, i) => `line ${i}`).join('\n');
  const out = render({ type: 'report', project: 'arvent', title: 'Full dialogues',
    lines: [['Total', 42]], path: '/tmp/x.txt', aside: long });

  assert.ok(out.length <= 1024, `caption over the limit: ${out.length}`);
  assert.ok(out.includes('⋯ cut, full text attached'), 'a caption cut must point at the attachment');
});

// ---------------------------------------------------------------------------
// Findings from the 03.09.2026 close review — one test per fix, each of them
// red on the code as it stood before that day.

test('markdownToTelegram never nests a link in a link or an entity in code', () => {
  // Every replace used to run over the output of the one before it. The
  // README badge `[![alt](img)](url)` came out as `<a><a>…</a></a>` and
  // `` `a **b** c` `` as `<code>a <b>b</b> c</code>`. Telegram rejects both
  // with a 4xx, and the package does not retry a 4xx — the card is lost.
  assert.equal(
    markdownToTelegram('[![Build Status](https://img.shields.io/b.svg)](https://github.com/x/runs/1)'),
    '<a href="https://github.com/x/runs/1">Build Status</a>'
  );
  assert.equal(markdownToTelegram('`a **b** c`'), '<code>a **b** c</code>');
  // Bold inside a link stays legal and must survive the parking.
  assert.equal(markdownToTelegram('[**bold link**](https://x/y)'), '<a href="https://x/y"><b>bold link</b></a>');
  assert.equal(
    markdownToTelegram('plain **b** and `c` and [t](https://u)'),
    'plain <b>b</b> and <code>c</code> and <a href="https://u">t</a>'
  );
});

test('a closed card keeps the subsections of its first section', () => {
  // `firstSection` cut at ANY heading level, so a `###` subsection inside the
  // first section ended the body early and the text under it vanished from a
  // merged PR or a closed issue.
  const out = render({
    type: 'issue', project: 'arvent', action: 'closed', number: 7, title: 't',
    url: 'https://x/i/7', body: '## One\nalpha\n### Sub\nbeta\n## Two\ngamma'
  });

  assert.ok(out.includes('beta'), 'a ### subsection ended the body early');
  assert.ok(!out.includes('gamma'), 'the second ## section leaked into the card');
});

test('the clamp does not leave a fenced block open', () => {
  // `pre` reached the clamper but neither tag list in this file, so a
  // regression that dropped it would cut `<pre>` open and every test here
  // would still pass.
  const body = ['```', 'x'.repeat(5000), '```'].join('\n');
  const card = render({ type: 'issue', project: 'arvent', action: 'opened', number: 1, title: 't', body, url: 'https://x/i/1' });

  assert.ok(card.includes('<pre>'), 'the fenced block never reached the card');
  assert.deepEqual(unbalanced(card), [], 'a fenced block was cut open');
  // And the checker can say no about `pre` too, or its yes means nothing.
  assert.deepEqual(unbalanced('<pre>x'), ['pre']);
});

test('action.yml reads the commit for every empty field, only on ci/deploy, and never in silence', () => {
  // Three defects in the same guard: it tested only the title (so an explicit
  // `commit-title` suppressed body and author), it ran on pr/issue events that
  // cannot use the result, and every failure — no token, 401, 404, timeout,
  // bad JSON — ended as an empty title with a green workflow.
  const yml = readFileSync(new URL('../action.yml', import.meta.url), 'utf8');
  const guard = yml.split('\n').find((l) => l.includes('-z "$IN_COMMIT_TITLE"') && l.includes('if '));

  assert.ok(guard, 'the commit-read guard is no longer where the test looks for it');
  assert.ok(guard.includes('IN_COMMIT_BODY'), 'an explicit commit-title still suppresses the body read');
  assert.ok(guard.includes('IN_COMMIT_AUTHOR'), 'an explicit commit-title still suppresses the author read');
  assert.ok(/IN_EVENT" = "ci"/.test(yml), 'the read still fires on pr/issue events');
  assert.ok(yml.includes('%{http_code}'), 'the HTTP status of the commit read is not captured');
  assert.ok(/::warning::commit read/.test(yml), 'a failed commit read produces no signal at all');
});

test('the catalogue accepts a commit row whose title carries its own separator', () => {
  // `Commit: <a>hash</a> · fix: a · b` is one pointer and one name, but the
  // exception refused any row with a second ` · ` anywhere — including its own
  // legal shape.
  const src = readFileSync(new URL('../catalogue/build.mjs', import.meta.url), 'utf8');
  const m = /const pointerThenName = (\(raw\) =>[^\n]+);/.exec(src);

  assert.ok(m, 'pointerThenName is no longer where the test looks for it');
  const pointerThenName = new Function(`return ${m[1]}`)() as (raw: string) => boolean;

  assert.equal(pointerThenName(' <a href="x">h</a> \u00b7 feat: a'), true, 'the plain pointer row was refused');
  assert.equal(pointerThenName(' <a href="x">h</a> \u00b7 feat: a \u00b7 b'), true, 'a title with its own separator was refused');
  assert.equal(pointerThenName('plain \u00b7 text'), false, 'the exception can no longer refuse anything');
});

test('incident: the bracket names WHERE it burns — the sender\'s word, else the project', () => {
  const named = render({ type: 'incident', project: 'mac-config', title: 'Disk is full', scope: 'Server' });
  assert.equal(named.split('\n')[1], '🚨 <b>Incident (Server):</b> Disk is full');

  const fallback = render({ type: 'incident', project: 'vault', title: 'The vault needs repair' });
  assert.equal(fallback.split('\n')[1], '🚨 <b>Incident (Vault):</b> The vault needs repair');
});
