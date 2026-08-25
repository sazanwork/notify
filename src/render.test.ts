/**
 * Один тест на весь пакет: для каждого типа события проверяет, что
 * экранирование сработало и длина не превышает лимит Telegram, плюс
 * инварианты нового формата (утверждён владельцем 20.08.2026): теги первой
 * строкой, машинный ключ = тег экземпляра, поле жирный ярлык + обычное
 * значение, значок из общего словаря. Встроенный раннер Node (`node --test`),
 * без vitest/jest — ловит ровно то, что может сломаться незаметно.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { ICON, severity, type NotifyEvent } from './events.ts';
import { render, eventKey, clampMessage } from './render.ts';

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
    type: 'report',
    project: 'arvent',
    title: 'Щ'.repeat(1100),
    path: '/tmp/x.txt'
  });

  assert.ok(caption.length <= 1024, `caption длиннее лимита: ${caption.length}`);
});

test('подпись файла укладывается в лимит caption 1024 и несёт тег', () => {
  const caption = render({
    type: 'report',
    project: 'arvent',
    title: 'Полные диалоги',
    path: '/tmp/x.txt',
    period: 'Ы'.repeat(3000)
  });

  assert.ok(caption.length <= 1024, `caption длиннее лимита: ${caption.length}`);
  assert.ok(caption.startsWith('#report #полные_диалоги\n'));
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

// Считаем КАЖДЫЙ тег, какой пакет умеет ставить, и на нескольких формах —
// прошлая версия смотрела только на <b> и только на карточку job. Из-за этого
// две настоящие поломки прошли мимо: длинный detail режется внутри blockquote,
// а длинное имя группы — внутри <u>, и Telegram отвечает на такое 400, то есть
// теряет ВСЁ сообщение. Второй ассерт прошлой версии (`!/<[a-z]*$/`) не мог
// упасть никогда: клампер всегда дописывает `\n…`, и конец строки по построению
// не бывает внутри тега.
const TAGS = ['b', 'i', 'u', 'a', 'code', 'blockquote'];

const unbalanced = (html: string): string[] =>
  TAGS.filter((t) => {
    const opened = (html.match(new RegExp(`<${t}[ >]`, 'g')) ?? []).length;
    const closed = (html.match(new RegExp(`</${t}>`, 'g')) ?? []).length;

    return opened !== closed;
  });

test('кламп не оставляет незакрытых тегов ни на одной форме', () => {
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

    assert.deepEqual(unbalanced(out), [], `${name}: незакрытый тег — Telegram отвергнет всё сообщение`);
  }
});

test('проверка баланса тегов умеет упасть', () => {
  // Сторож над сторожем: ассерт выше стоит ровно столько, сколько стоит
  // `unbalanced`. Если она перестанет замечать незакрытый тег, тест наверху
  // позеленеет на сломанном рендере и никто этого не увидит.
  assert.deepEqual(unbalanced('<b>x</b><u>y'), ['u']);
  assert.deepEqual(unbalanced('<blockquote>x'), ['blockquote']);
  assert.deepEqual(unbalanced('<b>x</b>'), []);
});

test('неизвестный тип события даёт понятную ошибку, а не падение рендерера', () => {
  assert.throws(
    () => render({ type: 'bogus', project: 'playhub' } as unknown as NotifyEvent),
    /unknown event type/
  );
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
  // every alarm arrived gutted. `Title:` now carries the short title and the
  // diagnosis is quoted under it, the same shape a commit body already had.
  const multiline = 'нет sops\nключ не найден\nлог: ~/Library/Logs/vault.log';
  const short = render({ type: 'incident', project: 'vault', title: 'Vault needs a fix', detail: multiline });
  const long = render({ type: 'incident', project: 'vault', title: 'Vault needs a fix', detail: 'А'.repeat(500) });

  assert.ok(short.includes('<b>Title:</b> Vault needs a fix'), 'заголовок аварии — поле Reason');
  assert.ok(short.includes('лог: ~/Library/Logs/vault.log'), 'последняя строка диагноза потеряна — вернулась обрезка');
  assert.ok(short.includes('<blockquote>'), 'диагноз должен идти цитатой');
  assert.ok(long.includes('<blockquote expandable>'), 'длинный диагноз сворачивается');
});

test('incident: detail equal to title is not printed twice', () => {
  const out = render({ type: 'incident', project: 'vault', title: 'Vault needs a fix', detail: 'Vault needs a fix' });

  assert.ok(out.includes('<b>Title:</b> Vault needs a fix'));
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
    '🚫 <b>Job:</b> disabled',
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
    '🆕 <b>Issue:</b> opened',
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
    '🆕 <b>PR:</b> opened',
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
    '<b>Title:</b> Vault needs a fix',
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
    '❓ <b>Heartbeat:</b> miss',
    '',
    '<b>Task:</b> Yandex game import',
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
  assert.ok(out.startsWith('#job #arvent_eval\n✅ <b>Job:</b> ok'),
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
    type: 'report', project: 'playhub', title: 'Analytics', period: 'compared to 23.08',
    lines: [['Pageviews (server)', '1284'], ['Game launches', '412']],
    items: [{ text: 'query — 12 clicks', url: 'https://x/q' }]
  });

  assert.equal(out, [
    '#report #analytics',
    'ℹ️ <b>Report:</b> Analytics',
    '',
    '<b>Period:</b> compared to 23.08',
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
    period: 'compared with 2026-08-21',
    lines: [['Humans in the server log', '262 ▲23']],
    url: 'https://github.com/sazanwork/game-publisher/blob/master/docs/analytics/2026-08-22.md'
  });

  assert.ok(
    out.includes('ℹ️ <b>Report:</b> <a href="https://github.com/sazanwork/game-publisher/blob/master/docs/analytics/2026-08-22.md">Analytics for 2026-08-22</a>'),
    'the report name is not the link'
  );
  assert.ok(
    out.includes('<b>Period:</b> compared with 2026-08-21'),
    'the period must be its own line, not a tail on the clickable name'
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
    out.includes('<b>Task:</b> <a href="https://github.com/sazanwork/playhub/actions/runs/42">Yandex game import</a>'),
    'the task name is not the link'
  );
  assert.ok(!out.includes('>open</a>'), 'the bare Workflow: open row came back');
});

test('link/job: a NAMED workflow still gets its own row — a second destination', () => {
  const out = render({
    type: 'job', project: 'playhub', job: 'Game validator', status: 'ok',
    url: 'https://x/run', workflowName: 'validate-games.yml', workflowUrl: 'https://x/wf'
  });

  assert.ok(out.includes('<b>Task:</b> <a href="https://x/wf">Game validator</a>'), 'task lost its link');
  assert.ok(out.includes('<b>Workflow:</b> <a href="https://x/wf">validate-games.yml</a>'), 'named workflow row was dropped');
});

test('link/incident: the title is the link', () => {
  const out = render({
    type: 'incident', project: 'vault', title: 'The vault needs repair',
    detail: 'three lines of diagnosis', url: 'https://x/run'
  });

  assert.ok(out.includes('<b>Title:</b> <a href="https://x/run">The vault needs repair</a>'), 'incident title is not the link');
  assert.ok(!out.includes('>open</a>'), 'the bare Workflow: open row came back on the incident');
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
    command: 'claude --resume 8f03d18c-b7d6-438c-bb40-6756c3e1e835'
  });

  assert.ok(out.includes('▶ <b>Run:</b> <code>claude --resume 8f03d18c-b7d6-438c-bb40-6756c3e1e835</code>'),
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
    command: 'rm /var/folders/x/claude-ctxguard/8f03d18c.latch'
  });

  assert.equal(out, [
    '#session #burning_the_limit',
    '🚨 <b>Session:</b> burning the limit',
    '',
    '<b>Id:</b> 8f03d18c-b7d6-438c-bb40-6756c3e1e835',
    '<b>Project:</b> mac-config',
    '<b>Reason:</b> context 871596 against a compact line of 500000, cache rewrites: 5 of the last 30 requests',
    '<blockquote>Пройди на Хекслете (ru.hexlet.io) по очереди эти темы из «Мои темы»</blockquote>',
    '',
    '▶ <b>Run:</b> <code>rm /var/folders/x/claude-ctxguard/8f03d18c.latch</code>'
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
    '#job #server_backups',
    '🔴 <b>Job:</b> fail',
    '',
    '<b>Task:</b> Server backups',
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

  assert.equal(gone.split('\n')[0], '#job #daily_import');
  assert.equal(gone.split('\n')[0], back.split('\n')[0], 'the pair does not share a tag line');
  assert.ok(gone.includes('❓ <b>Job:</b> silent'), 'silence has lost its own icon');
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
    command: 'bash ~/bin/update-all --tests-only'
  });
  const lines = out.split('\n').filter(Boolean);

  assert.ok(lines.at(-1)?.startsWith('▶ <b>Run:</b>'), `the action is not the last line: ${lines.at(-1)}`);
  assert.equal(out.match(/▶/g)?.length, 1, 'the marker must be unique in the card, or it stops marking anything');
  assert.ok(out.includes('<code>bash ~/bin/update-all --tests-only</code>'), 'the command lost its copyable box');
});

test('action: a card with nothing to run carries no marker', () => {
  const out = render({
    type: 'job', project: 'mac-config', job: 'Server backups', status: 'fail',
    note: 'fresh copies: 10, broken: 1'
  });

  assert.ok(!out.includes('▶'), 'a card with no action must not show the action marker');
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
