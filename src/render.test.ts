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
import test from 'node:test';
import { ICON, severity, type NotifyEvent } from './events.ts';
import { render, eventKey, clampMessage, OUTCOME_TAG } from './render.ts';
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
  [{ type: 'session', project: 'mac-config', action: 'back to normal', status: 'ok' }, ICON.ok],
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

test('type line: the icon stays outside the bold, and no name is invented', () => {
  const text = render({ type: 'ci', project: 'arvent', status: 'ok' });
  const secondLine = text.split('\n')[1];

  // Nothing named this run, so line 2 is the type and nothing else. It used to
  // print the status word here — the outcome said a third time, after the icon
  // and the tag, in the slot reserved for a name.
  assert.equal(secondLine, '✅ <b>CI</b>');
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

  // One row, like a task and a pull request: the hash carries the link, the
  // subject stands beside it. `Title:` under it was the same second row the
  // issue card had already lost.
  assert.ok(ci.includes(
    '<b>Commit:</b> <a href="https://github.com/sazanwork/arvent/commit/9b1fc68">9b1fc68</a>'
    + ' Онбординг: заготовки вопросов (#294)'
  ));
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

  // Number and title are ONE identifier on the type line, the way GitHub writes
  // it. With no url it is still there, simply not a link.
  assert.equal(issue.split('\n')[1], '🆕 <b>Issue:</b> #322 Коммиты не следуют конвенции');
  assert.ok(!issue.includes('<b>Number:</b>'), 'the Number row came back');
  assert.ok(!issue.includes('<b>Title:</b>'), 'the Title row came back');
  assert.equal((issue.match(/<b>Issue:<\/b>/g) ?? []).length, 1, 'the type label must not repeat');
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
  assert.ok(clamped.includes('…'), 'the cut lost the ellipsis');
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
const TAGS = ['b', 'i', 'u', 'a', 'code', 'blockquote'];

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

test('deploy: a commit with a link is clickable, the label is bold, the value is plain', () => {
  const out = render({
    type: 'deploy',
    project: 'game-publisher',
    status: 'ok',
    commit: 'abc123',
    commitUrl: 'https://github.com/sazanwork/game-publisher/commit/abc123'
  });

  assert.ok(out.includes('<b>Commit:</b> <a href="https://github.com/sazanwork/game-publisher/commit/abc123">abc123</a>'));
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

  assert.equal(short.split('\n')[1], '🚨 <b>Incident:</b> Vault needs a fix');
  assert.ok(short.includes('лог: ~/Library/Logs/vault.log'), 'the last line of the diagnosis was cut off');
  assert.ok(short.includes('<blockquote>'), 'the diagnosis must be quoted');
  assert.ok(long.includes('<blockquote expandable>'), 'a long diagnosis folds up');
});

test('incident: detail equal to title is not printed twice', () => {
  const out = render({ type: 'incident', project: 'vault', title: 'Vault needs a fix', detail: 'Vault needs a fix' });

  assert.equal(out.split('\n')[1], '🚨 <b>Incident:</b> Vault needs a fix');
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
    '\u{1F534} <b>Deploy:</b> <a href="https://x/run">Deploy to Beget</a>'
  );
  assert.ok(!deploy.includes('<b>Via:</b>'), 'the Via row carried the name a floor below');
  assert.ok(!deploy.includes('<b>Workflow:</b>'), 'the trailing Workflow row had to go');

  const ci = render({
    type: 'ci', project: 'arvent', status: 'fail', branch: 'master',
    commit: '9b1fc68', commitUrl: 'https://x/c',
    workflowName: 'nightly', workflowUrl: 'https://x/run'
  });

  assert.equal(
    ci.split('\n')[1],
    '\u{1F534} <b>CI:</b> <a href="https://x/run">nightly</a>'
  );
  assert.ok(!ci.includes('<b>Check:</b>'), 'CI called its own name by a different word');
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

  assert.ok(out.includes('>Deploy to Beget</a>'), 'the link must be named after the workflow');
  assert.ok(!out.includes('>GitHub Actions</a>'), 'the platform is not the name of the run');
});

// A hand deploy has no run to open: the type line still says by what means it
// went out, it is simply not a link.
test('run: a hand deploy names the means and has nothing to open', () => {
  const out = render({
    type: 'deploy', project: 'game-publisher', status: 'ok',
    commit: '3f1a882', commitUrl: 'https://x/c', via: 'manual, from the Mac'
  });

  assert.equal(out.split('\n')[1], '\u2705 <b>Deploy:</b> manual, from the Mac');
  assert.ok(!out.includes('<a href="https://x/run"'), 'a hand deploy has no run');
});

// Facts about the RUN touch the type line, because the type line already names
// the run — the same place a job card puts `Reason:`. Facts about the COMMIT
// are a different subject and keep a heading. The owner read `Reason:` against
// the name on one card and under a heading on another and asked for one rule.
test('blocks: run facts touch the name, the commit keeps its heading', () => {
  const both = render({
    type: 'ci', project: 'arvent', status: 'fail', branch: 'master',
    commit: '9b1fc68', commitUrl: 'https://x/c', actor: '@chelsnebes',
    note: '3 tests failed', workflowUrl: 'https://x/run', workflowName: 'nightly'
  });
  const rows = both.split('\n');

  assert.ok(!both.includes('<i><u>Run</u></i>'), 'the Run heading announced what line 2 already said');
  assert.equal(rows[2], '<b>Actor:</b> @chelsnebes');
  assert.equal(rows[3], '<b>Reason:</b> 3 tests failed');
  assert.equal(rows[4], '');
  assert.equal(rows[5], '<i><u>Change</u></i>');

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

  // The link survives on the type word itself. It used to be given the made-up
  // name `the run`, which named nothing and read like a real workflow.
  assert.equal(
    out.split('\n')[1],
    '\u{1F534} <a href="https://x/run"><b>Deploy</b></a>',
    'the link to the logs was lost'
  );
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
    '🔴 <b>Job:</b> Backups from the server',
    '<b>Reason:</b> no fresh copy arrived from the server'
  ].join('\n'));
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
    '✅ <b>Job:</b> Game import',
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
    '🚫 <b>Job:</b> GitHub Actions minutes watchdog',
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

  assert.equal(out, [
    '#ci #master #ok',
    '✅ <a href="https://x/run"><b>CI</b></a>',
    '<b>Actor:</b> @chelsnebes',
    '',
    '<i><u>Change</u></i>',
    '<b>Commit:</b> <a href="https://x/c">9b1fc68</a> Онбординг: заготовки вопросов (#294)',
    '<blockquote>Тело коммита, написанное человеком.</blockquote>'
  ].join('\n'));
});

test('card/ci scheduled: a run with no commit body still says why it ran', () => {
  const out = render({
    type: 'ci', project: 'arvent', status: 'ok', branch: 'master',
    commit: '9b1fc68', commitUrl: 'https://x/c',
    note: 'nightly check of master', workflowUrl: 'https://x/run'
  });

  assert.equal(out, [
    '#ci #master #ok',
    '✅ <a href="https://x/run"><b>CI</b></a>',
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
    '✅ <b>Deploy:</b> <a href="https://x/run">GitHub Actions</a>',
    '',
    '<i><u>Change</u></i>',
    '<b>Commit:</b> <a href="https://x/c">a1b2c3d</a> feat: new landing'
  ].join('\n'));
});

test('card/issue: body arrives — it never did before', () => {
  const out = render({
    type: 'issue', project: 'mac-config', action: 'opened', number: 322,
    title: 'Commit convention for all repos',
    body: 'Тело задачи с GitHub, как его написал человек.',
    author: 'mikitasazan', url: 'https://x/i/322'
  });

  assert.equal(out, [
    '#issue #i322 #info',
    '🆕 <b>Issue:</b> <a href="https://x/i/322">#322 Commit convention for all repos</a>',
    '<b>Author:</b> mikitasazan',
    '',
    '<blockquote>Тело задачи с GitHub, как его написал человек.</blockquote>'
  ].join('\n'));
});

// The whole reason the order was turned around: on `assigned` the one new fact
// is the person, and it used to be the last row under a 1400-character quote.
test('card/issue: the assignee is the second row, and the old body is gone', () => {
  const out = render({
    type: 'issue', project: 'arvent', action: 'assigned', number: 312,
    title: 'Web booking page',
    body: 'A very long description the owner has already read.',
    author: 'mikitasazan', assignee: 'Ilja-Prihach', url: 'https://x/i/312'
  });

  assert.equal(out, [
    '#issue #i312 #info',
    '🙋 <b>Issue:</b> <a href="https://x/i/312">#312 Web booking page</a>',
    '<b>Author:</b> mikitasazan',
    '<b>Assignee:</b> Ilja-Prihach'
  ].join('\n'));
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
    '🆕 <b>PR:</b> <a href="https://x/p/294">#294 Onboarding: question drafts</a>',
    '<b>Author:</b> Ilja-Prihach',
    '',
    '<blockquote>PR description here.</blockquote>'
  ].join('\n'));

  // One title is one line, the same for every type. It is the identifier now,
  // so a two-line title is cut at the first line like any other value.
  const twoLine = render({
    type: 'pr', project: 'playhub', action: 'opened', number: 1,
    title: 'first line\nsecond line'
  });
  assert.ok(twoLine.includes('#1 first line'), 'the PR identifier is number plus title');
  assert.ok(!twoLine.includes('second line'), 'a title is cut at its first line');
});

test('card/incident: every line of the diagnosis survives', () => {
  const out = render({
    type: 'incident', project: 'vault', title: 'Vault needs a fix',
    detail: 'нет sops\nключ не найден\nлог: ~/Library/Logs/vault.log',
    logs: '~/Library/Logs/vault.log'
  });

  assert.equal(out, [
    '#incident #vault_needs_a_fix #fail',
    '🚨 <b>Incident:</b> Vault needs a fix',
    '<blockquote>нет sops',
    'ключ не найден',
    'лог: ~/Library/Logs/vault.log</blockquote>',
    '',
    '<b>Log:</b> <code>~/Library/Logs/vault.log</code>'
  ].join('\n'));
});

test('card/heartbeat miss', () => {
  const out = render({
    type: 'heartbeat_miss', project: 'playhub', job: 'Yandex game import',
    expected: 'at least once every 26h', lastSeen: 'never'
  });

  assert.equal(out, [
    '#heartbeat #yandex_game_import #unknown',
    '❓ <b>Heartbeat:</b> Yandex game import',
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
  assert.ok(out.startsWith('#job #arvent_eval #ok\n✅ <b>Job:</b> Eval: bot answer quality'),
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
    'ℹ️ <b>Report:</b> Analytics (compared to 23.08)',
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

  assert.equal(rows[1], 'ℹ️ <b>Report:</b> russkie-igry.ru (2026-08-25)');
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
    for (const m of s.matchAll(/<(\/?)(b|a|i|u|code|blockquote)[ >]/g)) {
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
    out.includes('ℹ️ <b>Report:</b> <a href="https://github.com/sazanwork/game-publisher/blob/master/docs/analytics/2026-08-22.md">Analytics for 2026-08-22</a> (compared with 2026-08-21)'),
    'the report name is not the link, or its brackets are gone'
  );
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

  assert.ok(out.includes('<b>Report:</b> <a href="https://x/board">Board</a>'), 'grouped report lost its link');
  assert.ok(!out.includes('Details'), 'the Details row came back in the grouped report');
});

test('link/job: the task name is the link, not a trailing Workflow: open', () => {
  const out = render({
    type: 'job', project: 'playhub', job: 'Yandex game import', status: 'fail',
    note: 'Yandex returned no games at all',
    url: 'https://github.com/sazanwork/playhub/actions/runs/42'
  });

  assert.ok(
    out.includes('<b>Job:</b> <a href="https://github.com/sazanwork/playhub/actions/runs/42">Yandex game import</a>'),
    'the task name is not the link'
  );
  assert.ok(!out.includes('>open</a>'), 'the bare Workflow: open row came back');
});

test('link/job: the workflow row is gone — it was line 2 written twice', () => {
  const out = render({
    type: 'job', project: 'playhub', job: 'Game validator', status: 'ok',
    url: 'https://x/run', workflowName: 'validate-games.yml', workflowUrl: 'https://x/wf'
  });

  assert.ok(out.includes('<b>Job:</b> <a href="https://x/wf">Game validator</a>'), 'task lost its link');
  // The row pointed at `workflowUrl ?? url` — the address line 2 already
  // carries — and it stood below the `To do:` command, past the end of what
  // the card is meant to say.
  assert.ok(!out.includes('<b>Workflow:</b>'), 'the duplicate destination came back');
});

test('link/incident: the title is the link', () => {
  const out = render({
    type: 'incident', project: 'vault', title: 'The vault needs repair',
    detail: 'three lines of diagnosis', url: 'https://x/run'
  });

  assert.ok(
    out.includes('🚨 <b>Incident:</b> <a href="https://x/run">The vault needs repair</a>'),
    'the incident title is not the type line, or not the link'
  );
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
    '#session #burning_the_limit #fail',
    '🚨 <b>Session:</b> burning the limit',
    '<b>Project:</b> mac-config',
    '<b>Reason:</b> context 871596 against a compact line of 500000, cache rewrites: 5 of the last 30 requests',
    '',
    // A block heading, in the one style every card uses for a block — not a
    // bold field label, which means `label: value` on a single line.
    '<i><u>Opened with</u></i>',
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

  assert.ok(one.startsWith('#session #burning_the_limit'), 'wrong tag');
  assert.equal(one.split('\n')[0], two.split('\n')[0], 'the tag changed with the session id');
  assert.equal(severity({ type: 'session', project: 'mac-config', action: 'x', status: 'fail' }), 'error');
  assert.equal(severity({ type: 'session', project: 'mac-config', action: 'x', status: 'ok' }), 'info');
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
    '🔴 <b>Job:</b> Server backups',
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
  assert.ok(gone.includes('❓ <b>Job:</b> Yandex game import'), 'silence has lost its own icon');
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
test('action: the line he must run is marked, copyable, and last', () => {
  const out = render({
    type: 'job', project: 'mac-config', job: 'Config checks', status: 'fail',
    note: 'red: test-update-all', logs: '/Users/x/Library/Logs/update-all.log',
    command: 'bash ~/bin/update-all --tests-only',
    commandNote: 'rerun the suite and read the log'
  });
  const lines = out.split('\n').filter(Boolean);

  assert.ok(lines.at(-1)?.startsWith('<code>'), `the action is not the last line: ${lines.at(-1)}`);
  assert.ok(out.includes('<b>To do:</b> rerun the suite and read the log'),
    'a command must never travel without saying what it does');
  // The command has no marker of its own, and must not have one: the
  // monospaced line under `To do:` IS the command — Telegram makes it copyable on tap.
  assert.ok(!out.includes('▶'), 'the command grew a marker back');
  assert.equal(lines.at(-1), '<code>bash ~/bin/update-all --tests-only</code>',
    'the last line must be the command itself and nothing else');
  assert.ok(out.includes('<code>bash ~/bin/update-all --tests-only</code>'), 'the command lost its copyable box');
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

// ── One number, one shape ───────────────────────────────────────────────────

test('trend: both numbers, and an arrow only where there is a second one', () => {
  // Now first, before second. The owner read `51 ▲5` and asked what the 5 was:
  // the distance between two numbers, only one of which the card showed.
  assert.equal(trend(210, 207), '210 / 207 ▲3');
  assert.equal(trend(202, 207), '202 / 207 ▼5');
  assert.equal(trend(0, 0), '0 / 0 =');
  // Nothing to compare to: a plain number, never a `+37` that looks like one.
  assert.equal(trend(37), '37');
  assert.equal(trend(37, undefined), '37');
  // The unit belongs to both numbers, and the arrow stands right of the pair.
  assert.equal(trend(4.4, 3.6, '%'), '4.4% / 3.6% ▲0.8');
  // Noise in the second decimal is not movement.
  assert.equal(trend(4.42, 4.44, '%'), '4.4% / 4.4% =');
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
