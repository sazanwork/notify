/**
 * Один рендерер на тип события, все по одному каркасу — утверждён
 * владельцем 20.08.2026 после ~15 живых раундов в тестовом форуме:
 *
 *   #тип #экземпляр
 *   значок <b>Тип:</b> действие
 *
 *   <b>Ярлык:</b> значение
 *   <blockquote>цитата чужого текста — тело коммита, тело задачи</blockquote>
 *
 *   <i><u>Группа</u></i>
 *   <b>#N (overdue):</b> <a>заголовок</a>
 *
 *   <b>Ярлык:</b> значение   ← действия/направления
 *
 * Три уровня начертания, никогда не смешиваются: поле — жирный ярлык с
 * большой буквы + обычное значение; группа — курсив+подчёркивание, без
 * жирности и без двоеточия; строка 2 (тип) — тот же закон поля. Пустая
 * строка разделяет БЛОКИ ПО СМЫСЛУ (шапка / суть / действия), не механически
 * после каждой строки.
 */
import type { Item, NotifyEvent } from './events.ts';

/** Первая буква — заглавная, остальное как есть (ga4/GitHub остаются собой). */
const cap = (s: string): string => (s.length > 0 ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** Экранируется ВСЁ, что пришло снаружи — теги ставит только шаблон. */
export const esc = (v: unknown): string =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * Telegram режет сообщение на 4096 символах — режем сами, по возможности по
 * границе строки.
 *
 * Два подвоха, оба приводили к ТИХОЙ потере сообщения:
 * 1. Резать строго по последнему `\n` нельзя: если длинный кусок идёт одной
 *    строкой (стектрейс, вывод команды — самый частый `detail` у инцидента),
 *    последний перевод строки стоит ПЕРЕД ним, и содержимое выбрасывалось
 *    целиком — приходил заголовок без единого факта о поломке.
 * 2. Резать посреди HTML-тега или сущности тоже нельзя: Telegram отвечает
 *    `400 can't parse entities`, а 4xx мы считаем постоянной ошибкой и не
 *    повторяем — сообщение исчезало совсем.
 */
export const clampMessage = (text: string, limit = 4000): string => {
  if (text.length <= limit) {
    return text;
  }

  const cut = text.slice(0, limit);
  const lastBreak = cut.lastIndexOf('\n');
  // По границе строки — только если так остаётся большая часть содержимого.
  let end = lastBreak > limit * 0.6 ? lastBreak : limit;

  // Не обрываемся внутри `<...>` и внутри `&...;` — иначе разметка ломается.
  const openTag = cut.lastIndexOf('<', end - 1);
  if (openTag !== -1 && cut.indexOf('>', openTag) === -1) {
    end = openTag;
  }
  const amp = cut.lastIndexOf('&', end - 1);
  if (amp !== -1 && end - amp <= 10 && cut.indexOf(';', amp) === -1) {
    end = amp;
  }

  const body = cut.slice(0, end);
  // Кламп мог отрезать закрывающие теги — добираем их, чтобы разметка сошлась.
  // blockquote — с приходом цитаты для примечаний/деталей длинный detail режется
  // прямо посередине неё, и без этого тега Telegram отвечал бы 400 на незакрытую
  // цитату (regex `<blockquote[ >]` ловит и вариант с атрибутом `expandable`).
  // `u` в списке с 2026-08-25: заголовок группы рисуется как `<i><u>…</u></i>`,
  // и обрезанный посередине длинный заголовок оставлял `<u>` незакрытым.
  // Telegram отвечает на такое 400 — то есть карточка пропадала целиком, а
  // отправитель с `|| true` этого не замечал. Нашёл Codex; воспроизводится
  // отчётом с именем группы в 5000 знаков.
  //
  // Порядок закрытия — обратный порядку ОТКРЫТИЯ, а не фиксированный список.
  // Фиксированный список закрывал `<i><u>` как `</i></u>`: тегов поровну,
  // счётчик сходится, вложенность нарушена, и Telegram отвечает тем же 400.
  // Второй заход того же бага (25.08.2026), поэтому теперь порядок берётся из
  // самого текста: последний открытый закрывается первым.
  const open: string[] = [];
  const tagRe = /<(\/?)(b|a|i|u|code|blockquote)[ >]/g;
  for (let m = tagRe.exec(body); m !== null; m = tagRe.exec(body)) {
    if (m[1] === '/') {
      const at = open.lastIndexOf(m[2]);
      if (at !== -1) {
        open.splice(at, 1);
      }
    } else {
      open.push(m[2]);
    }
  }
  const tail = open
    .reverse()
    .map((t) => `</${t}>`)
    .join('');

  return `${body}${tail}\n…`;
};

// Только первая строка: однострочное поле по контракту (коммит, ветка,
// автор, статистика), а не место для абзаца. Живой случай (18.08): CI-карточка
// понесла ПОЛНОЕ тело коммита с историей под-коммитов через `--commit` и вместо
// одной строки развернулась на 3000 символов — многострочный текст либо
// ошибка вызывающего, либо должен идти через `note()`, а не молча раздувать
// карточку.
const firstLine = (value: string | number): string | number => {
  if (typeof value === 'number' || !value.includes('\n')) {
    return value;
  }

  return `${value.split('\n')[0]}…`;
};

/**
 * Поле: `<b>Ярлык:</b> значение` — жирный ярлык с большой буквы, значение
 * обычным. `null` отбрасывается наравне с `undefined`/`''` — источники поля
 * это JSON со stdin (`--json`) и объекты с сервера, где отсутствующее
 * значение сериализуется как `null`, а не как пропущенный ключ.
 */
const field = (label: string, value: string | number | null | undefined): string | null =>
  value === undefined || value === null || value === '' ? null : `<b>${esc(cap(label))}:</b> ${esc(firstLine(value))}`;

/**
 * Поле-идентификатор (`commit:`/`pr:`/`issue:`): значение — ссылка, если
 * она есть, иначе обычный текст того же поля — идентификатор не должен
 * пропадать целиком только потому, что вызывающий не передал url.
 */
const fieldLink = (
  label: string,
  url: string | null | undefined,
  text: string | number | null | undefined
): string | null => {
  if (text === undefined || text === null || text === '') {
    return null;
  }

  // `firstLine` here for the same reason `field` has it: the linked case used to
  // skip it, so a multi-line value (arvent's two-line `commit`) became two-line
  // LINK TEXT instead of one identifier.
  return url
    ? `<b>${esc(cap(label))}:</b> <a href="${esc(url)}">${esc(firstLine(text))}</a>`
    : field(label, text);
};

/**
 * Поле-действие (`workflow:`): в отличие от `fieldLink`, без URL это НЕ
 * поле — прогону просто некуда вести, показывать голое слово «run» без
 * ссылки бессмысленнее, чем не показывать строку вовсе.
 */
// Текст ссылки — имя того, куда она ведёт (имя workflow, имя прогона). Запасное
// слово было «run»: существительное, которое ничего не называет — владелец читал
// «Workflow: run» и не понимал, что это. «open» — глагол, он хотя бы честно
// говорит, что это ссылка, а не название.
const fieldAction = (label: string, url: string | undefined, text: string | undefined): string | null =>
  url ? `<b>${esc(cap(label))}:</b> <a href="${esc(url)}">${esc(text ?? 'open')}</a>` : null;

/** Моноширинное поле — путь/команда для копирования, не ссылка. */
const fieldCode = (label: string, value: string | undefined): string | null =>
  value ? `<b>${esc(cap(label))}:</b> <code>${esc(value)}</code>` : null;

/** Заголовок группы: курсив + подчёркивание, без жирности, без двоеточия. */
const group = (name: string): string => `<i><u>${esc(cap(name))}</u></i>`;

/** Позиция внутри группы: `<b>label:</b> <a>text</a>` — либо простая маркированная/нумерованная строка без label. */
const groupItem = (it: Item, index: number, numbered: boolean): string => {
  const linked = it.url ? `<a href="${esc(it.url)}">${esc(it.text)}</a>` : esc(it.text);

  if (it.label) {
    return `<b>${esc(it.label)}:</b> ${linked}`;
  }

  return numbered ? `${index + 1}. ${linked}` : `• ${linked}`;
};

// Длинное пояснение (примечание, детали инцидента) — цитатой: у Telegram это
// полоска слева и лёгкий отступ, читается как «подробности», а не как часть
// заголовка. Длиннее ~400 знаков — цитата сворачивается сама (`expandable`,
// Bot API), иначе стектрейс или дамп лога растягивает карточку на весь экран.
const EXPAND_AT = 400;
const note = (text: string | undefined): string | null => {
  if (!text) {
    return null;
  }
  const body = esc(text);

  return body.length > EXPAND_AT ? `<blockquote expandable>${body}</blockquote>` : `<blockquote>${body}</blockquote>`;
};

const join = (parts: Array<string | null>): string => parts.filter((p): p is string => p !== null).join('\n');

/** Плоский список позиций (без ярлыков) — job/report без групп. */
const bullets = (items: Item[] | undefined, numbered: boolean): string[] =>
  (items ?? []).map((it, i) => groupItem(it, i, numbered));

/** Именованная группа целиком: заголовок + позиции, разделены строкой пустоты внутри вызова через join. */
const renderGroup = (g: { name: string; items: Item[] }): string[] => [
  group(g.name),
  ...g.items.map((it, i) => groupItem(it, i, false))
];

/**
 * ОДНО правило на все карточки, где есть и заголовок, и тело: заголовок —
 * обычное поле `Title:`, тело — цитата, и в цитате больше ничего нет.
 *
 * Раньше заголовок клался В ЦИТАТУ вместе с телом, разделённые пустой
 * строкой. Владелец нашёл, чем это плохо: заголовок — главное в карточке, то,
 * ЧТО это, а лежал он серым текстом того же веса, что и описание, и отличить
 * одно от другого можно было только по пустой строке. У PR без тела карточка
 * вырождалась в одинокую серую цитату из одной строки.
 *
 * Заголовок режется до первой строки: многострочный subject коммита не должен
 * затягивать в поле собственное тело.
 */
const titleField = (title: string | undefined): string | null =>
  field('Title', title);

const bodyQuote = (body: string | undefined): string | null =>
  body ? note(body) : null;

type Renderer<E extends NotifyEvent> = (e: E) => string;

// Значок = статус сообщения, не тип события. Ровно четыре на весь пакет —
// закреплённая легенда в форумах обещает это владельцу как факт, не как
// приближение. 🔴 сломалось, 🚨 инцидент, ✅ прошло, ℹ️ к сведению.
const ICON = { red: '🔴', alarm: '🚨', ok: '✅', info: 'ℹ️' } as const;

/** Строка 2: значок вне жирного, `<b>Тип:</b> действие` — то же поле, не особый случай. */
// `action` объявлен строкой, но приходит и из `--json`, и из прямых вызовов на
// JS, где типов нет. Пустое или отсутствующее значение давало строку `ℹ️ null`
// прямо во второй строке карточки. Пустая строка честнее: поле просто исчезает.
// A link belongs on the NAME of the thing it opens, never on a separate row
// whose only text is the verb `open`. The owner read `Details: open` under a
// report and asked what "open" was — the answer is the report itself, which was
// sitting three lines above as dead text. So line 2 takes an optional URL and
// the action text becomes the link: `Report: <a>Analytics for 12.08</a>`.
const typeLine = (icon: string, type: string, action: string | undefined, url?: string): string => {
  // `field` возвращает null на пустом значении, а интерполяция null в шаблон
  // печатает слово «null». Так вторая строка карточки становилась `ℹ️ null` —
  // достижимо через `--json` и прямой вызов на JS, где типов нет.
  // `action || 'open'` in the linked case: an empty title must not swallow the
  // link, which would be the one thing the card cannot afford to lose.
  const line = url ? fieldLink(type, url, action || 'open') : field(type, action);

  return line === null ? `${icon} <b>${esc(cap(type))}</b>` : `${icon} ${line}`;
};

// `workflowUrl ?? url`: половина отправителей шлёт ссылку на прогон под именем
// `--url` — это имя было в пакете раньше и осталось в вызовах. Рендер читал
// только `workflowUrl`, поэтому красная карточка приходила БЕЗ ЕДИНОЙ ССЫЛКИ
// на логи. Отвергать `--url` было бы честнее по имени и хуже по делу: намерение
// однозначно, а карточка без ссылки бесполезна ровно тогда, когда нужна.
const renderDeploy: Renderer<Extract<NotifyEvent, { type: 'deploy' }>> = (e) => {
  const icon = e.status === 'ok' ? ICON.ok : ICON.red;

  return join([
    typeLine(icon, 'Deploy', e.status),
    '',
    fieldLink('Commit', e.commitUrl, e.commit),
    titleField(e.commitTitle),
    bodyQuote(e.commitBody),
    field('Via', e.via),
    field('Target', e.target),
    field('Reason', e.note),
    e.workflowUrl ?? e.url ? '' : null,
    fieldAction('Workflow', e.workflowUrl ?? e.url, e.workflowName)
  ]);
};

const renderJob: Renderer<Extract<NotifyEvent, { type: 'job' }>> = (e) => {
  const icon = e.status === 'fail' || e.status === 'disabled' ? ICON.red : ICON.ok;
  const hasItems = (e.items ?? []).length > 0;
  const disabledList = hasItems && e.status === 'disabled';

  return join([
    typeLine(icon, 'Job', e.status),
    '',
    // The name is NOT the type line: line 2 is `Job: fail` by the format's own
    // rule, so the name is its own field. Called `Task:` and not `Job:` because
    // repeating the label of the line right above it reads as a mistake.
    // Until now the name was dropped entirely — every caller passed it and the
    // owner only ever saw it as the small grey instance tag.
    // The run link rides on the task's own name. It used to sit at the bottom
    // as `Workflow: open` — every job caller passes a URL and none passes a
    // workflow name, so that row was the bare verb the owner objected to.
    fieldLink('Task', e.workflowUrl ?? e.url, e.job),
    field('Reason', e.note),
    ...(e.stats ?? []).map(([label, value]) => field(label, value)),
    hasItems ? '' : null,
    // Heading ONLY for `disabled`. It used to print for any job carrying a
    // list, so playhub's daily card of newly published games was headed
    // "Disabled workflows".
    disabledList ? group('Disabled workflows') : null,
    ...(hasItems ? bullets(e.items, disabledList) : []),
    // Kept only when the caller actually names the workflow — a named row is a
    // second, different destination; an unnamed one repeats the Task link.
    e.workflowName && (e.workflowUrl ?? e.url) ? '' : null,
    e.workflowName ? fieldAction('Workflow', e.workflowUrl ?? e.url, e.workflowName) : null
  ]);
};

const renderReport: Renderer<Extract<NotifyEvent, { type: 'report' }>> = (e) => {
  if (e.groups && e.groups.length > 0) {
    const body = e.groups.flatMap((g, i) => (i === 0 ? renderGroup(g) : ['', ...renderGroup(g)]));

    return join([
      typeLine(ICON.info, 'Report', e.period ? `${e.title} · ${e.period}` : e.title, e.url),
      '',
      ...body
    ]);
  }

  const items = bullets(e.items, false);

  return join([
    // Both analytics jobs send a link to the day's snapshot in docs/. It used to
    // hang off a trailing `Details: open` row; now it is the report's own name.
    typeLine(ICON.info, 'Report', e.period ? `${e.title} · ${e.period}` : e.title, e.url),
    '',
    ...(e.lines ?? []).map(([label, value]) => field(label, value)),
    items.length > 0 ? '' : null,
    ...items
  ]);
};

const renderCi: Renderer<Extract<NotifyEvent, { type: 'ci' }>> = (e) => {
  const icon = e.status === 'ok' ? ICON.ok : ICON.red;

  return join([
    typeLine(icon, 'CI', e.status),
    '',
    fieldLink('Commit', e.commitUrl, e.commit),
    titleField(e.commitTitle),
    bodyQuote(e.commitBody),
    field('Actor', e.actor),
    field('Reason', e.note),
    e.workflowUrl ?? e.url ? '' : null,
    fieldAction('Workflow', e.workflowUrl ?? e.url, e.workflowName)
  ]);
};

// PR/Issue: значок теперь по статусу (четыре на пакет), не по действию —
// `merged`/`approved` = успех, `changes_requested` = требует внимания,
// остальное = к сведению. Слово действия само по себе уже говорит, что
// произошло (`opened`, `ready_for_review` и т.д.), значок дублировать не должен.
const PR_ICON: Record<Extract<NotifyEvent, { type: 'pr' }>['action'], string> = {
  opened: ICON.info,
  ready_for_review: ICON.info,
  review_requested: ICON.info,
  approved: ICON.ok,
  changes_requested: ICON.red,
  merged: ICON.ok,
  closed: ICON.info
};

const ISSUE_ICON: Record<Extract<NotifyEvent, { type: 'issue' }>['action'], string> = {
  opened: ICON.info,
  assigned: ICON.info,
  closed: ICON.ok
};

const renderPr: Renderer<Extract<NotifyEvent, { type: 'pr' }>> = (e) =>
  join([
    typeLine(PR_ICON[e.action], 'PR', e.action),
    '',
    // Идентификатор первым, заголовок под ним: так вещь читается «#118, вот
    // такая», а не «вот такая, кстати #118» — и так её пишет сам GitHub.
    fieldLink('Number', e.url, `#${e.number}`),
    titleField(e.title),
    bodyQuote(e.body),
    // Без пустой строки перед автором: у задачи её нет, и одно и то же поле
    // не должно стоять по-разному в двух соседних карточках. Пустая строка в
    // этом формате означает «дальше указатель, куда пойти» — автор не он.
    field('Author', e.author),
    field('Reviewer', e.reviewer)
  ]);

const renderIssue: Renderer<Extract<NotifyEvent, { type: 'issue' }>> = (e) =>
  join([
    typeLine(ISSUE_ICON[e.action], 'Issue', e.action),
    '',
    fieldLink('Number', e.url, `#${e.number}`),
    titleField(e.title),
    bodyQuote(e.body),
    field('Author', e.author),
    field('Assignee', e.assignee)
  ]);

const renderIncident: Renderer<Extract<NotifyEvent, { type: 'incident' }>> = (e) =>
  join([
    typeLine(ICON.alarm, 'Incident', 'open'),
    '',
    // `detail` is a diagnosis of several lines (vault greps three of them plus a
    // log path). It used to go through `field`, which keeps only the first line,
    // so every alarm this package ever sent arrived gutted. Same shape as a
    // commit now: short label, full text quoted under it.
    // Ярлык `Title`, а не `Reason`: у аварии заголовок — такой же заголовок,
    // как у коммита и задачи, и называться в одной карточке он должен так же.
    // Same rule as the report: the link rides on the incident's own title
    // rather than on a trailing row whose only text is the word `open`.
    fieldLink('Title', e.url, e.title),
    e.detail && e.detail !== e.title ? note(e.detail) : null,
    e.logs ? '' : null,
    fieldCode('Logs', e.logs)
  ]);

// Раньше всё это склеивалось в одну строку `Reason:` через тире: «имя — no
// reports — expected X, last seen Y». Каждая другая карточка кладёт факт на
// свою строку с ярлыком, и владелец справедливо спросил, зачем тут отдельный
// формат. Отдельного формата больше нет.
const renderHeartbeatMiss: Renderer<Extract<NotifyEvent, { type: 'heartbeat_miss' }>> = (e) => {
  const icon = e.recovered ? ICON.ok : ICON.red;
  const action = e.recovered ? 'ok' : 'miss';

  return join([
    typeLine(icon, 'Heartbeat', action),
    '',
    field('Task', e.job),
    field('Reason', e.note),
    field('Expected', e.expected),
    field(e.recovered ? 'Last run' : 'Last seen', e.lastSeen)
  ]);
};

// Подпись файла — та же карточка, но лимит Telegram у caption свой: 1024.
const renderFile: Renderer<Extract<NotifyEvent, { type: 'file' }>> = (e) =>
  join([
    typeLine(ICON.info, 'File', 'new'),
    '',
    // Раньше здесь стояло `field('Title', e.note ?? e.title)`: подпись файла
    // приходила под ярлыком заголовка, а сам заголовок из карточки исчезал.
    // Один ярлык — один смысл: Title это title, Reason это note.
    field('Title', e.title),
    field('Reason', e.note)
  ]);

const RENDERERS: { [K in NotifyEvent['type']]: Renderer<Extract<NotifyEvent, { type: K }>> } = {
  deploy: renderDeploy,
  job: renderJob,
  report: renderReport,
  ci: renderCi,
  pr: renderPr,
  issue: renderIssue,
  incident: renderIncident,
  heartbeat_miss: renderHeartbeatMiss,
  file: renderFile
};

// Тег наверху карточки И машинный ключ разборщика — ОДНО И ТО ЖЕ значение
// (решение владельца 20.08.2026): раньше это были два разных представления
// одного факта (снизу — дефисный `#ci-arvent`, сверху — теги вручную), и это
// читалось как дублирование. Разделитель — подчёркивание, не дефис: дефис
// разрывает Telegram-хэштег на середине слова (`#mac-config` линкуется
// только как `#mac`), а тег ДОЛЖЕН быть кликабельным — это и есть фильтр
// «показать всю историю этого экземпляра», которым владелец пользуется вживую.
const slug = (raw: string): string =>
  raw
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);

// Тип-тег наверху — не буквальный `e.type`: `heartbeat_miss` читался бы как
// `#heartbeat_miss`, а видимый тип у владельца всегда просто `#heartbeat`
// (зелёная и красная карточки одного вида — один и тот же тип-тег).
const TYPE_TAG: Record<NotifyEvent['type'], string> = {
  deploy: 'deploy',
  job: 'job',
  report: 'report',
  ci: 'ci',
  pr: 'pr',
  issue: 'issue',
  incident: 'incident',
  heartbeat_miss: 'heartbeat',
  file: 'file'
};

/**
 * Экземпляр-тег: что именно это конкретное событие (ветка, окружение,
 * задача, номер) — по нему разборщик сверяет 🔴 с более поздней зелёной
 * карточкой ТОГО ЖЕ экземпляра. Явный `key` побеждает всегда; без него —
 * выводится из самых стабильных полей типа (ветка/окружение важнее заголовка,
 * потому что заголовок у регулярной задачи не меняется, а у отчёта как раз
 * заголовок и есть единственное стабильное поле).
 */
export const eventKey = (e: NotifyEvent): string => {
  const fallback = (): string => {
    switch (e.type) {
      case 'ci':
        return slug(e.branch || e.project);
      case 'deploy':
        return slug(e.target || e.project);
      case 'job':
      case 'heartbeat_miss':
        return slug(e.job);
      case 'report':
      case 'incident':
      case 'file':
        return slug(e.title);
      case 'pr':
        return `p${e.number}`;
      case 'issue':
        return `i${e.number}`;
    }
  };

  return e.key ? slug(e.key) : fallback();
};

const tagsLine = (e: NotifyEvent): string => `#${TYPE_TAG[e.type]} #${esc(eventKey(e))}`;

/**
 * Рендерит событие в готовый HTML-текст, обрезанный под лимит Telegram.
 * Теги — ПЕРВАЯ строка, добавляются до обрезки (не после, как раньше): они
 * несут и человеческий фильтр, и машинный ключ разборщика — обрезанная
 * карточка без них была бы не только некликабельной, но и невидимой
 * разборщику ровно на самых длинных, то есть самых важных сообщениях.
 */
export const render = (e: NotifyEvent): string => {
  const renderer = RENDERERS[e.type] as Renderer<typeof e> | undefined;

  // Прикрывает путь `--json` и вызовы из JS без типов: там `type` — обычная
  // строка, и неизвестное значение роняло процесс через `renderer is not a
  // function`. Падать из-за уведомления нельзя.
  if (typeof renderer !== 'function') {
    throw new Error(`unknown event type: ${String(e.type)}`);
  }

  const tags = tagsLine(e);
  // clampMessage может выйти за переданный limit на хвост закрывающих тегов и
  // многоточие — минус 40 оставляет ему этот запас. У сообщений свой запас уже
  // есть (4000 против 4096 у Telegram), у caption лимит 1024 настоящий.
  const budget = Math.max(64, e.type === 'file' ? 1024 - tags.length - 40 : 4000 - tags.length - 1);

  return `${tags}\n${clampMessage(renderer(e), budget)}`;
};
