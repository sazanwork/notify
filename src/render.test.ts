/**
 * Один тест на весь пакет: для каждого типа события проверяет, что
 * экранирование сработало и длина не превышает лимит Telegram, плюс
 * инварианты нового формата (утверждён владельцем 20.08.2026): теги первой
 * строкой, машинный ключ = тег экземпляра, поле жирный ярлык + обычное
 * значение, ровно четыре значка. Встроенный раннер Node (`node --test`),
 * без vitest/jest — ловит ровно то, что может сломаться незаметно.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { severity, type NotifyEvent } from './events.ts';
import { render, eventKey } from './render.ts';

const XSS = '<script>alert(1)</script>';

const SAMPLES: NotifyEvent[] = [
  { type: 'deploy', project: 'playhub', status: 'fail', commit: XSS, url: 'https://x' },
  { type: 'job', project: 'playhub', job: XSS, status: 'ok', stats: [['метка', XSS]] },
  { type: 'report', project: 'playhub', title: XSS, period: '26 июля', lines: [['ключ', XSS]] },
  { type: 'ci', project: 'arvent', status: 'fail', branch: 'master', commitTitle: XSS, actor: 'x' },
  { type: 'pr', project: 'arvent', action: 'opened', number: 1, title: XSS, author: XSS },
  { type: 'issue', project: 'arvent', action: 'opened', number: 1, title: XSS, assignee: XSS },
  { type: 'incident', project: 'arvent', title: XSS, detail: XSS },
  { type: 'heartbeat_miss', project: 'playhub', job: XSS, lastSeen: '10:00' }
];

for (const sample of SAMPLES) {
  test(`${sample.type}: экранирует и укладывается в лимит`, () => {
    const text = render(sample);

    assert.ok(!text.includes('<script>'), 'сырой <script> не должен пройти в вывод');
    assert.ok(text.includes('&lt;script&gt;'), 'экранированный вариант должен присутствовать');
    assert.ok(text.length <= 4096, `длина ${text.length} превышает лимит Telegram`);
  });
}

test('теги — первая строка, ДО текста, не после', () => {
  const text = render({ type: 'ci', project: 'arvent', status: 'ok', branch: 'master' });

  assert.match(text, /^#ci #master\n/, `теги не на первой строке: ${text.slice(0, 40)}`);
});

test('тег-экземпляр = машинный ключ разборщика — одно и то же значение, не два', () => {
  const e: NotifyEvent = { type: 'job', project: 'playhub', job: 'Импорт игр', status: 'fail' };
  const text = render(e);

  assert.ok(text.startsWith(`#job #${eventKey(e)}\n`), 'тег наверху не совпал с eventKey()');
});

test('slug: разделитель — подчёркивание, не дефис (дефис рвёт Telegram-хэштег)', () => {
  const text = render({ type: 'job', project: 'playhub', job: 'GitHub board sync', status: 'fail' });

  assert.ok(text.includes('#job #github_board_sync'));
  assert.ok(!text.includes('-'), `дефис просочился в тег: ${text.slice(0, 60)}`);
});

test('явный --key побеждает выведенный, тоже через подчёркивание', () => {
  const text = render({ type: 'job', project: 'playhub', job: 'x', status: 'fail', key: 'vps backups' });

  assert.ok(text.startsWith('#job #vps_backups\n'));
});

test('один и тот же ключ у 🔴 и у последующего успеха — иначе разборщику не с чем сверять', () => {
  const red: NotifyEvent = { type: 'heartbeat_miss', project: 'vault', job: 'Дайджест задач' };
  const green: NotifyEvent = { type: 'heartbeat_miss', project: 'vault', job: 'Дайджест задач', recovered: true };

  assert.equal(eventKey(red), eventKey(green));
});

test('ровно четыре значка на весь пакет, не больше', () => {
  const ALLOWED = ['🔴', '🚨', '✅', 'ℹ️'];
  const events: NotifyEvent[] = [
    { type: 'ci', project: 'arvent', status: 'ok' },
    { type: 'ci', project: 'arvent', status: 'fail' },
    { type: 'deploy', project: 'arvent', status: 'ok' },
    { type: 'job', project: 'arvent', job: 'x', status: 'disabled' },
    { type: 'heartbeat_miss', project: 'arvent', job: 'x' },
    { type: 'heartbeat_miss', project: 'arvent', job: 'x', recovered: true },
    { type: 'pr', project: 'arvent', action: 'opened', number: 1, title: 't' },
    { type: 'pr', project: 'arvent', action: 'merged', number: 1, title: 't' },
    { type: 'pr', project: 'arvent', action: 'changes_requested', number: 1, title: 't' },
    { type: 'issue', project: 'arvent', action: 'opened', number: 1, title: 't' },
    { type: 'issue', project: 'arvent', action: 'closed', number: 1, title: 't' },
    { type: 'report', project: 'arvent', title: 't', lines: [] },
    { type: 'incident', project: 'arvent', title: 't' },
    { type: 'file', project: 'arvent', title: 't', path: '/tmp/x' }
  ];

  for (const e of events) {
    const text = render(e);
    const secondLine = text.split('\n')[1];
    const icon = ALLOWED.find((i) => secondLine.startsWith(i));

    assert.ok(icon, `строка типа не начинается с одного из четырёх значков: ${secondLine}`);
  }
});

test('строка типа: значок вне жирного, "Тип: действие" жирным целиком', () => {
  const text = render({ type: 'ci', project: 'arvent', status: 'ok' });
  const secondLine = text.split('\n')[1];

  assert.equal(secondLine, '✅ <b>CI:</b> ok');
});

test('поле: жирный ярлык с большой буквы, значение обычным текстом', () => {
  const text = render({ type: 'job', project: 'arvent', job: 'x', status: 'fail', note: 'причина' });

  assert.ok(text.includes('<b>Reason:</b> причина'));
  assert.ok(!text.includes('<b>Reason:</b> <b>причина</b>'), 'значение не должно быть жирным');
});

test('commit/pr/issue — единая форма: ярлык → идентификатор ссылкой → цитата с названием, без дублей', () => {
  const ci = render({
    type: 'ci',
    project: 'arvent',
    status: 'ok',
    commit: '9b1fc68',
    commitUrl: 'https://github.com/sazanwork/arvent/commit/9b1fc68',
    commitTitle: 'Онбординг: заготовки вопросов (#294)'
  });

  assert.ok(ci.includes('<b>Title:</b> Онбординг: заготовки вопросов (#294)'));
  assert.ok(ci.includes('<b>Commit:</b> <a href="https://github.com/sazanwork/arvent/commit/9b1fc68">9b1fc68</a>'));
  // Заголовок — поле, не цитата: цитата держит ТОЛЬКО тело. Без тела её нет.
  assert.ok(!ci.includes('<blockquote>'), 'без тела цитаты быть не должно');
  assert.equal((ci.match(/Онбординг: заготовки вопросов \(#294\)/g) ?? []).length, 1);

  const issue = render({
    type: 'issue',
    project: 'arvent',
    action: 'opened',
    number: 322,
    title: 'Коммиты не следуют конвенции',
    body: 'разбор 150 коммитов'
  });

  assert.ok(issue.includes('<b>Number:</b> #322'), 'без url номер задачи всё равно показывается, просто без ссылки');
  // Ярлык второй строки — `Number`, а не `Issue`: строка выше уже говорит
  // `Issue: opened`, и повтор ярлыка читается как ошибка вёрстки.
  assert.equal((issue.match(/<b>Issue:<\/b>/g) ?? []).length, 1, 'ярлык типа не должен повторяться');
  assert.ok(issue.includes('<b>Title:</b> Коммиты не следуют конвенции'));
  assert.ok(issue.includes('<blockquote>разбор 150 коммитов</blockquote>'));
});

test('группы отчёта: заголовок курсив+подчёркивание, без жирности и без двоеточия', () => {
  const text = render({
    type: 'report',
    project: 'arvent',
    title: 'tasks',
    period: '20.08',
    lines: [],
    groups: [
      { name: 'Ready', items: [{ label: '#243 (overdue)', text: 'Развернуть продукт', url: 'https://x/243' }] },
      { name: 'In Progress', items: [{ label: '#287', text: 'Проверить лист', url: 'https://x/287' }] }
    ]
  });

  assert.ok(text.includes('<i><u>Ready</u></i>'));
  assert.ok(text.includes('<i><u>In Progress</u></i>'));
  assert.ok(!text.includes('<b><u>'), 'заголовок группы не должен быть жирным');
  assert.ok(text.includes('<b>#243 (overdue):</b> <a href="https://x/243">Развернуть продукт</a>'));
});

test('job disabled: список выключенных — нумерованный, без ярлыка на каждой позиции', () => {
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

test('incident: logs — моноширинный локальный путь, не ссылка', () => {
  const text = render({ type: 'incident', project: 'arvent', title: 'x', detail: 'reason', logs: '~/.claude/logs/' });

  assert.ok(text.includes('<b>Logs:</b> <code>~/.claude/logs/</code>'));
});

test('report: items рендерятся ссылками, текст экранируется (плоский вид без групп)', () => {
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

  assert.ok(text.includes('<a href="https://github.com/x/y/issues/38">'), 'ссылка должна остаться кликабельной');
  assert.ok(text.includes('&lt;script&gt;'), 'текст позиции должен быть экранирован');
  assert.ok(!text.includes('<script>'), 'сырой тег не должен пройти');
  assert.ok(text.includes('• без ссылки'), 'позиция без url — просто строка');
});

test('clampMessage режет длинный текст, теги остаются ПЕРВОЙ строкой не тронутыми', () => {
  const long = Array.from({ length: 500 }, (_, i) => `строка ${i}`).join('\n');
  const clamped = render({ type: 'incident', project: 'playhub', title: 'x', detail: long });

  assert.ok(clamped.length <= 4096, `длина ${clamped.length} превышает лимит Telegram`);
  assert.ok(clamped.startsWith('#incident #x\n'), `теги не сохранились первой строкой: ${clamped.slice(0, 40)}`);
  assert.ok(clamped.includes('…'), 'обрезка потеряла многоточие');
});

test('гигантский заголовок файла без --key не выносит caption за 1024', () => {
  const caption = render({
    type: 'file',
    project: 'arvent',
    title: 'Щ'.repeat(1100),
    path: '/tmp/x.txt'
  });

  assert.ok(caption.length <= 1024, `caption длиннее лимита: ${caption.length}`);
});

test('подпись файла укладывается в лимит caption 1024 и несёт тег', () => {
  const caption = render({
    type: 'file',
    project: 'arvent',
    title: 'Полные диалоги',
    path: '/tmp/x.txt',
    note: 'Ы'.repeat(3000)
  });

  assert.ok(caption.length <= 1024, `caption длиннее лимита: ${caption.length}`);
  assert.ok(caption.startsWith('#file #полные_диалоги\n'));
});

test('длинный текст ОДНОЙ строкой не выбрасывается целиком', () => {
  const clamped = render({
    type: 'incident',
    project: 'playhub',
    title: 'Упал импорт',
    detail: 'A'.repeat(6000)
  });

  assert.ok(clamped.length > 3000, `содержимое потеряно, длина всего ${clamped.length}`);
  assert.ok(clamped.includes('AAAA'));
});

test('кламп не оставляет незакрытых тегов', () => {
  const clamped = render({
    type: 'job',
    project: 'playhub',
    job: 'x',
    status: 'fail',
    note: 'Ж'.repeat(5000)
  });

  const opened = (clamped.match(/<b[ >]/g) ?? []).length;
  const closed = (clamped.match(/<\/b>/g) ?? []).length;

  assert.equal(opened, closed, 'несбалансированный <b> — Telegram отвергнет сообщение');
  assert.ok(!/<[a-z]*$/.test(clamped), 'сообщение обрывается внутри тега');
});

test('неизвестный тип события даёт понятную ошибку, а не падение рендерера', () => {
  assert.throws(
    () => render({ type: 'bogus', project: 'playhub' } as unknown as NotifyEvent),
    /неизвестный тип события/
  );
});

/**
 * Легенда значков закреплена в теме Ops и обещает: значок = статус (четыре
 * варианта), не тип. Успех/провал/внимание не должны путаться между собой.
 */
test('PR/Issue: успех и требующее внимания не делят один значок', () => {
  const changesRequested = render({
    type: 'pr',
    project: 'arvent',
    action: 'changes_requested',
    number: 1,
    title: 'т'
  });
  const merged = render({ type: 'pr', project: 'arvent', action: 'merged', number: 1, title: 'т' });

  assert.ok(changesRequested.split('\n')[1].startsWith('🔴'));
  assert.ok(merged.split('\n')[1].startsWith('✅'));
});

test('задача: исполнитель попадает в сообщение', () => {
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

test('deploy: commit со ссылкой кликабелен, ярлык жирный, значение обычным', () => {
  const out = render({
    type: 'deploy',
    project: 'game-publisher',
    status: 'ok',
    commit: 'abc123',
    commitUrl: 'https://github.com/sazanwork/game-publisher/commit/abc123'
  });

  assert.ok(out.includes('<b>Commit:</b> <a href="https://github.com/sazanwork/game-publisher/commit/abc123">abc123</a>'));
});

test('deploy: reason поясняет отмену/пропуск — тем же полем, без цитаты', () => {
  const out = render({
    type: 'deploy',
    project: 'playhub',
    status: 'fail',
    note: 'отменён: секреты не нашли'
  });

  assert.ok(out.includes('<b>Reason:</b> отменён: секреты не нашли'));
  assert.ok(!out.includes('<blockquote>отменён'), 'reason — поле, не цитата');
});

test('incident: detail is quoted in full, never cut to its first line', () => {
  // This test used to assert the opposite — that a long detail stayed a
  // one-line field. That WAS the bug: `field()` keeps only the first line, and
  // vault (the only sender of this type) passes a three-line diagnosis, so
  // every alarm arrived gutted. Reason now carries the short title and the
  // diagnosis is quoted under it, the same shape a commit body already had.
  const multiline = 'нет sops\nключ не найден\nлог: ~/Library/Logs/vault.log';
  const short = render({ type: 'incident', project: 'vault', title: 'Vault needs a fix', detail: multiline });
  const long = render({ type: 'incident', project: 'vault', title: 'Vault needs a fix', detail: 'А'.repeat(500) });

  assert.ok(short.includes('<b>Reason:</b> Vault needs a fix'), 'заголовок аварии — поле Reason');
  assert.ok(short.includes('лог: ~/Library/Logs/vault.log'), 'последняя строка диагноза потеряна — вернулась обрезка');
  assert.ok(short.includes('<blockquote>'), 'диагноз должен идти цитатой');
  assert.ok(long.includes('<blockquote expandable>'), 'длинный диагноз сворачивается');
});

test('incident: detail equal to title is not printed twice', () => {
  const out = render({ type: 'incident', project: 'vault', title: 'Vault needs a fix', detail: 'Vault needs a fix' });

  assert.ok(out.includes('<b>Reason:</b> Vault needs a fix'));
  assert.ok(!out.includes('<blockquote>'), 'цитата повторяет заголовок — образец это запрещает');
});

test('multiline commit title режется до первой строки (защита от полного тела в поле)', () => {
  const messy = 'Онбординг: заготовки вопросов (#294)\n\n* feat(onboarding): длинное тело\n\nещё абзац';
  const ci = render({ type: 'ci', project: 'arvent', status: 'ok', commit: '9b1fc68', commitTitle: messy });

  assert.ok(ci.includes('Онбординг: заготовки вопросов (#294)…'), 'заголовок коммита не обрезан до первой строки');
  assert.ok(!ci.includes('feat(onboarding)'), 'многострочный commitTitle просочился в цитату целиком');
});

test('job stats: значение не жирное, поле — ярлык+значение', () => {
  const out = render({ type: 'job', project: 'vault', job: 'x', status: 'ok', stats: [['вердикт', 'ok']] });

  assert.ok(out.includes('<b>Вердикт:</b> ok'));
  assert.ok(!out.includes('<b>ok</b>'));
});

test('field/fieldLink принимают null как отсутствие значения (JSON со stdin шлёт null, не пропуск ключа)', () => {
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

test('workflow без url — строки нет вообще, не "Workflow: run" без ссылки', () => {
  const out = render({ type: 'ci', project: 'arvent', status: 'ok' });

  assert.ok(!out.includes('Workflow'), 'пустое поле workflow не должно рендериться без ссылки');
});

test('severity: job disabled звонит как fail, heartbeat recovered — молчит как success', () => {
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
    '#job #vps_backups',
    '🔴 <b>Job:</b> fail',
    '',
    '<b>Task:</b> Backups from the server',
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
    '#job #daily_import',
    '✅ <b>Job:</b> ok',
    '',
    '<b>Task:</b> Game import',
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
    '#job #actions_minutes_guard',
    '🔴 <b>Job:</b> disabled',
    '',
    '<b>Task:</b> GitHub Actions minutes watchdog',
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
    '#ci #master',
    '✅ <b>CI:</b> ok',
    '',
    '<b>Commit:</b> <a href="https://x/c">9b1fc68</a>',
    '<b>Title:</b> Онбординг: заготовки вопросов (#294)',
    '<blockquote>Тело коммита, написанное человеком.</blockquote>',
    '<b>Actor:</b> @chelsnebes',
    '',
    '<b>Workflow:</b> <a href="https://x/run">open</a>'
  ].join('\n'));
});

test('card/ci scheduled: a run with no commit body still says why it ran', () => {
  const out = render({
    type: 'ci', project: 'arvent', status: 'ok', branch: 'master',
    commit: '9b1fc68', commitUrl: 'https://x/c',
    note: 'nightly check of master', workflowUrl: 'https://x/run'
  });

  assert.equal(out, [
    '#ci #master',
    '✅ <b>CI:</b> ok',
    '',
    '<b>Commit:</b> <a href="https://x/c">9b1fc68</a>',
    '<b>Reason:</b> nightly check of master',
    '',
    '<b>Workflow:</b> <a href="https://x/run">open</a>'
  ].join('\n'));
});

test('card/deploy', () => {
  const out = render({
    type: 'deploy', project: 'playhub', status: 'ok',
    commit: 'a1b2c3d', commitUrl: 'https://x/c', commitTitle: 'feat: new landing',
    via: 'GitHub Actions', workflowUrl: 'https://x/run'
  });

  assert.equal(out, [
    '#deploy #playhub',
    '✅ <b>Deploy:</b> ok',
    '',
    '<b>Commit:</b> <a href="https://x/c">a1b2c3d</a>',
    '<b>Title:</b> feat: new landing',
    '<b>Via:</b> GitHub Actions',
    '',
    '<b>Workflow:</b> <a href="https://x/run">open</a>'
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
    '#issue #i322',
    'ℹ️ <b>Issue:</b> opened',
    '',
    '<b>Number:</b> <a href="https://x/i/322">#322</a>',
    '<b>Title:</b> Commit convention for all repos',
    '<blockquote>Тело задачи с GitHub, как его написал человек.</blockquote>',
    '<b>Author:</b> mikitasazan'
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
    '#pr #p294',
    'ℹ️ <b>PR:</b> opened',
    '',
    '<b>Number:</b> <a href="https://x/p/294">#294</a>',
    '<b>Title:</b> Onboarding: question drafts',
    '<blockquote>PR description here.</blockquote>',
    '<b>Author:</b> Ilja-Prihach'
  ].join('\n'));

  // Один заголовок — одна строка, у всех типов одинаково. PR-заголовок раньше
  // был исключением и НЕ резался; исключение убрано вместе с тем, что его
  // порождало — заголовок больше не лежит в цитате, он поле как все.
  const twoLine = render({
    type: 'pr', project: 'playhub', action: 'opened', number: 1,
    title: 'first line\nsecond line'
  });
  assert.ok(twoLine.includes('<b>Title:</b> first line'), 'заголовок PR — поле');
  assert.ok(!twoLine.includes('second line'), 'заголовок режется по первой строке, как у задачи и коммита');
});

test('card/incident: every line of the diagnosis survives', () => {
  const out = render({
    type: 'incident', project: 'vault', title: 'Vault needs a fix',
    detail: 'нет sops\nключ не найден\nлог: ~/Library/Logs/vault.log',
    logs: '~/Library/Logs/vault.log'
  });

  assert.equal(out, [
    '#incident #vault_needs_a_fix',
    '🚨 <b>Incident:</b> open',
    '',
    '<b>Reason:</b> Vault needs a fix',
    '<blockquote>нет sops',
    'ключ не найден',
    'лог: ~/Library/Logs/vault.log</blockquote>',
    '',
    '<b>Logs:</b> <code>~/Library/Logs/vault.log</code>'
  ].join('\n'));
});

test('card/heartbeat miss', () => {
  const out = render({
    type: 'heartbeat_miss', project: 'playhub', job: 'Yandex game import',
    expected: 'at least once every 26h', lastSeen: 'never'
  });

  assert.equal(out, [
    '#heartbeat #yandex_game_import',
    '🔴 <b>Heartbeat:</b> miss',
    '',
    '<b>Task:</b> Yandex game import',
    '<b>Expected:</b> at least once every 26h',
    '<b>Last seen:</b> never'
  ].join('\n'));
});

test('card/file: caption is clamped at 1024, not 4000', () => {
  const out = render({
    type: 'file', project: 'arvent', title: 'Eval dialogues',
    path: '/tmp/x.txt', note: 'Ц'.repeat(4000)
  });

  assert.ok(out.length <= 1024, `caption ${out.length} chars — Telegram cuts at 1024`);
  assert.ok(out.startsWith('#file #eval_dialogues\nℹ️ <b>File:</b> new'));
});

test('card/report', () => {
  const out = render({
    type: 'report', project: 'playhub', title: 'Analytics', period: 'compared to 23.08',
    lines: [['Pageviews (server)', '1284'], ['Game launches', '412']],
    items: [{ text: 'query — 12 clicks', url: 'https://x/q' }]
  });

  assert.equal(out, [
    '#report #analytics',
    'ℹ️ <b>Report:</b> Analytics · compared to 23.08',
    '',
    '<b>Pageviews (server):</b> 1284',
    '<b>Game launches:</b> 412',
    '',
    '• <a href="https://x/q">query — 12 clicks</a>'
  ].join('\n'));
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
