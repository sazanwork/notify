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

  assert.ok(ci.includes('<b>Commit:</b> <a href="https://github.com/sazanwork/arvent/commit/9b1fc68">9b1fc68</a>'));
  assert.ok(ci.includes('<blockquote>Онбординг: заготовки вопросов (#294)</blockquote>'));
  // Заголовок не должен повторяться и как текст ссылки, и в цитате одновременно.
  assert.equal((ci.match(/Онбординг: заготовки вопросов \(#294\)/g) ?? []).length, 1);

  const issue = render({
    type: 'issue',
    project: 'arvent',
    action: 'opened',
    number: 322,
    title: 'Коммиты не следуют конвенции',
    body: 'разбор 150 коммитов'
  });

  assert.ok(issue.includes('<b>Issue:</b> #322'), 'без url номер задачи всё равно показывается, просто без ссылки');
  assert.ok(issue.includes('<blockquote>Коммиты не следуют конвенции\n\nразбор 150 коммитов</blockquote>'));
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

test('note: длинный текст сворачивается (expandable), короткий — нет', () => {
  const short = render({ type: 'incident', project: 'playhub', title: 'x', detail: 'коротко' });
  const long = render({ type: 'incident', project: 'playhub', title: 'x', detail: 'А'.repeat(500) });

  assert.ok(short.includes('<b>Reason:</b> коротко'), 'короткая причина у incident — поле, не цитата');
  assert.ok(long.includes('<b>Reason:</b>'), 'длинная причина остаётся полем: сворачивание касается только цитат коммита/задачи');
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
