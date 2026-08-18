/**
 * Один тест на весь пакет: для каждого типа события проверяет, что
 * экранирование сработало и длина не превышает лимит Telegram. Встроенный
 * раннер Node (`node --test`), без vitest/jest — ловит ровно то, что может
 * сломаться незаметно: съехавший формат и дыру в экранировании.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import type { NotifyEvent } from './events.ts';
import { render } from './render.ts';

const XSS = '<script>alert(1)</script>';

const SAMPLES: NotifyEvent[] = [
  { type: 'deploy', project: 'playhub', status: 'fail', commit: XSS, url: 'https://x' },
  { type: 'job', project: 'playhub', job: XSS, status: 'ok', stats: [['метка', XSS]] },
  { type: 'report', project: 'playhub', title: XSS, period: '26 июля', lines: [['ключ', XSS]] },
  { type: 'ci', project: 'arvent', status: 'fail', branch: XSS, actor: 'x' },
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

test('report: items рендерятся ссылками, текст экранируется', () => {
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

test('clampMessage режет длинный текст по границе строки, ключ остаётся последней строкой', () => {
  const long = Array.from({ length: 500 }, (_, i) => `строка ${i}`).join('\n');
  const clamped = render({ type: 'incident', project: 'playhub', title: 'x', detail: long });

  // Реальный предел — лимит Telegram (4096), не число реализации: цитата
  // добавляет свои закрывающие теги поверх бюджета клампа.
  assert.ok(clamped.length <= 4096, `длина ${clamped.length} превышает лимит Telegram`);
  // Многоточие обрезки стоит ПЕРЕД ключом: обрезанная карточка без ключа была
  // бы невидима дневному разборщику именно на самых длинных сообщениях.
  assert.ok(clamped.includes('…\n'), 'обрезка потеряла многоточие');
  assert.ok(clamped.endsWith('<i><code>#x</code></i>'), `ключ не последняя строка: …${clamped.slice(-40)}`);
});

test('ключ задачи: явный --key побеждает, выведенный строится из заголовка', () => {
  const explicit = render({
    type: 'job',
    project: 'playhub',
    job: 'Импорт игр',
    status: 'fail',
    key: 'import-games'
  });
  const derived = render({ type: 'job', project: 'playhub', job: 'Импорт игр', status: 'ok' });

  assert.ok(explicit.endsWith('<i><code>#import-games</code></i>'));
  assert.ok(derived.endsWith('<i><code>#импорт-игр</code></i>'));
});

test('один ключ у 🔴 и у следующего успеха — иначе разборщику не с чем сверять', () => {
  const red = render({ type: 'job', project: 'vault', job: 'Дайджест задач', status: 'fail' });
  const green = render({ type: 'report', project: 'vault', title: 'Дайджест задач', period: '18.08', lines: [] });

  const tail = (s: string): string => s.slice(s.lastIndexOf('\n') + 1);

  assert.equal(tail(red), tail(green), 'fail-карточка и успешный отчёт одной задачи разошлись по ключу');
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

test('подпись файла укладывается в лимит caption 1024 и несёт ключ', () => {
  const caption = render({
    type: 'file',
    project: 'arvent',
    title: 'Полные диалоги',
    path: '/tmp/x.txt',
    note: 'Ы'.repeat(3000)
  });

  assert.ok(caption.length <= 1024, `caption длиннее лимита: ${caption.length}`);
  assert.ok(caption.endsWith('<i><code>#полные-диалоги</code></i>'));
});

test('длинный текст ОДНОЙ строкой не выбрасывается целиком', () => {
  // Самый частый detail у инцидента — стектрейс или вывод команды, часто без
  // единого перевода строки. Раньше такой текст терялся весь: приходил
  // заголовок и ничего о поломке.
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
    job: 'Ж'.repeat(5000), // заголовок обёрнут в <b> — обрыв внутри тега ломал разметку
    status: 'fail'
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
 * Легенда значков закреплена в теме Ops и обещает: один значок — один вид
 * события. Совпадение значков делает ленту нечитаемой ровно там, где по ней
 * следят за работой команды.
 */
test('у каждого вида PR и задачи свой значок, повторов нет', () => {
  const prActions = [
    'opened',
    'ready_for_review',
    'review_requested',
    'approved',
    'changes_requested',
    'merged',
    'closed'
  ] as const;
  const issueActions = ['opened', 'assigned', 'closed'] as const;

  const icons = [
    ...prActions.map(
      (action) =>
        render({ type: 'pr', project: 'arvent', action, number: 1, title: 'т' } as NotifyEvent).slice(0, 2)
    ),
    ...issueActions.map(
      (action) =>
        render({ type: 'issue', project: 'arvent', action, number: 2, title: 'т' } as NotifyEvent).slice(0, 2)
    )
  ];

  assert.equal(new Set(icons).size, icons.length, `значки повторяются: ${icons.join(' ')}`);
});

test('задача: исполнитель попадает в сообщение', () => {
  const out = render({
    type: 'issue',
    project: 'arvent',
    action: 'assigned',
    number: 128,
    title: 'Лист ожидания',
    assignee: 'Ilja'
  } as NotifyEvent);

  assert.match(out, /Задача #128/);
  assert.match(out, /Ilja/);
});

test('deploy: коммит со ссылкой кликабелен и жирный', () => {
  const out = render({
    type: 'deploy',
    project: 'game-publisher',
    status: 'ok',
    commit: 'feat: x',
    commitUrl: 'https://github.com/sazanwork/game-publisher/commit/abc123'
  } as never);
  assert.ok(out.includes('<a href="https://github.com/sazanwork/game-publisher/commit/abc123"><b>feat: x</b></a>'));
});

test('deploy: note поясняет отмену/пропуск — цитатой, без жирного и без метки', () => {
  const out = render({
    type: 'deploy',
    project: 'playhub',
    status: 'fail',
    note: 'отменён: секреты не нашли'
  } as never);
  assert.ok(out.includes('<blockquote>отменён: секреты не нашли</blockquote>'));
});

test('deploy: без note цитаты нет', () => {
  const out = render({ type: 'deploy', project: 'playhub', status: 'ok' } as never);
  assert.ok(!out.includes('<blockquote'));
});

test('note: длинный текст сворачивается (expandable), короткий — нет', () => {
  const short = render({ type: 'incident', project: 'playhub', title: 'x', detail: 'коротко' });
  const long = render({ type: 'incident', project: 'playhub', title: 'x', detail: 'А'.repeat(500) });

  assert.ok(short.includes('<blockquote>коротко</blockquote>'));
  assert.ok(long.includes('<blockquote expandable>'), 'длинная деталь не свернулась');
});

test('kv: цифры без жирного, через тире', () => {
  const out = render({ type: 'job', project: 'vault', job: 'x', status: 'ok', stats: [['вердикт', 'ok']] });

  assert.ok(out.includes('вердикт — ok'));
  assert.ok(!out.includes('<b>ok</b>'));
});
