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
import { ICON, LOUD, iconFor, type Item, type NotifyEvent } from './events.ts';

/** Первая буква — заглавная, остальное как есть (ga4/GitHub остаются собой). */
/**
 * Ярлык с большой буквы — но НЕ у имени, которое пишется со строчной нарочно:
 * `iOS` превращалось в `IOS`. Признак — вторая буква заглавная.
 */
const cap = (s: string): string => {
  if (s.length === 0 || /^[a-z][A-Z]/.test(s)) {
    return s;
  }

  return s.charAt(0).toUpperCase() + s.slice(1);
};

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

/**
 * Строка, которая просит что-то ОТ ВЛАДЕЛЬЦА, а не сообщает факт. Она уже
 * стояла последней и через пустую строку, и всё равно читалась как рядовое
 * поле среди пяти других. Маркер `▶` — единственное отличие: заголовок группы
 * здесь был бы третьей строкой разметки на карточку из шести (25.08.2026, два
 * ревью против группировки), а маркер не тратит ни одной.
 */
/**
 * Действие: что сделать и чем. Без объяснения команда НЕ печатается вовсе —
 * владелец на голую `rm` в карточке: «я ж не знаю, что делаю». Молча уронить
 * строку лучше, чем показать ему команду, которую он не может прочитать;
 * отправителя при этом ловит тест каталога, а не тишина в чате.
 */
const fieldRun = (value: string | undefined, why: string | undefined): string[] => {
  const explain = field('To do', why);

  return value && explain !== null ? [explain, `▶ <code>${esc(value)}</code>`] : [];
};

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

/**
 * Цитата с подписью. Голая цитата читается как продолжение поля над ней:
 * владелец спросил про строку, которой открыта сессия, «что значит этот текст,
 * откуда он берётся» — и был прав, в карточке это нигде не сказано. Подпись
 * стоит отдельной строкой, потому что сам текст в поле не помещается: поле
 * держит одну строку и обрезает.
 */
const quoted = (label: string, text: string | undefined): string | null =>
  text ? `<b>${esc(cap(label))}</b>\n${note(text)}` : null;

/**
 * Склейка карточки. Пустая строка здесь — знак смены блока, а не отступ:
 * две подряд означают пустой блок, ведущая — блок, которого нет. Обе
 * появляются, когда часть полей не пришла, и обе схлопываются тут, а не
 * в каждом рендерере по отдельности.
 */
const join = (parts: Array<string | null>): string => {
  const out: string[] = [];
  for (const part of parts) {
    if (part === null) {
      continue;
    }
    if (part === '' && (out.length === 0 || out[out.length - 1] === '')) {
      continue;
    }
    out.push(part);
  }
  while (out.length > 0 && out[out.length - 1] === '') {
    out.pop();
  }

  return out.join('\n');
};

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

/**
 * Строки с ярлыками, разложенные по группам, которые назвал сам отправитель.
 *
 * Закон простой и считается программой: назвал группу — заголовок печатается.
 * Всегда, сколько бы строк в ней ни было и сколько бы групп ни оказалось.
 * Порог «две и больше» я пробовал и снял: у карточки резервных копий все
 * цифры лежат в одной группе, а над ними — рассказ о прогоне, и порог гасил
 * ровно тот шов, ради которого владелец всё это и просил.
 *
 * Так же уходит и риск «одна и та же карточка выглядит по-разному в разные
 * дни»: вид зависит от того, что отправитель НАЗВАЛ в коде, а не от того,
 * сколько строк набралось сегодня.
 *
 * Порядок групп — порядок первого появления у отправителя: он знает, что
 * важнее. Строки без имени идут первыми и без заголовка — это факты о самой
 * карточке, а не о каком-то из её предметов.
 */
const labelled = (rows: Array<[string, string | number, string?]> | undefined): string[] => {
  const list = rows ?? [];
  const names = [...new Set(list.map(([, , g]) => g).filter((g): g is string => !!g))];

  if (names.length === 0) {
    return list.map(([label, value]) => field(label, value)).filter((l): l is string => l !== null);
  }

  const out: string[] = [];
  const bare = list.filter(([, , g]) => !g);
  for (const [label, value] of bare) {
    const line = field(label, value);
    if (line !== null) {
      out.push(line);
    }
  }
  for (const name of names) {
    // Пустая строка перед КАЖДЫМ заголовком, включая первый: над ним всегда
    // стоят поля самой карточки (Task, Period), и без шва заголовок читался
    // как ещё одна их строка. Двойных пустот бояться не нужно — их схлопывает
    // `join`.
    out.push('');
    out.push(group(name));
    for (const [label, value] of list.filter(([, , g]) => g === name)) {
      const line = field(label, value);
      if (line !== null) {
        out.push(line);
      }
    }
  }

  return out;
};

/**
 * Блоки, которыми владеет сам рендерер, — у выкатки и проверки их два, и они
 * про разные вещи: `Run` это сам прогон и его обстоятельства, `Change` это
 * изменение, из-за которого он случился. Владелец на CI-карточке: «commit,
 * actor, workflow — не знаю, всё так сумбурно».
 *
 * Заголовок печатается у КАЖДОГО непустого блока, а не только когда их два.
 * Сначала было «два и больше», ради экономии строки на зелёной карточке, и
 * это оказалось ошибкой: у зелёной выкатки нет ни цели, ни причины, блок один,
 * заголовки пропадали — и один и тот же вид уведомления выглядел в разные дни
 * по-разному. Владелец дважды спросил «почему здесь нет групп», глядя именно
 * на зелёную. Строка заголовка стоит дешевле, чем необходимость каждый раз
 * заново искать глазами, где что.
 */
const twoBlocks = (run: Array<string | null>, change: Array<string | null>): Array<string | null> => {
  const live = (rows: Array<string | null>): string[] => rows.filter((r): r is string => r !== null && r !== '');
  const out: Array<string | null> = [];
  for (const [name, rows] of [['Run', live(run)], ['Change', live(change)]] as Array<[string, string[]]>) {
    if (rows.length > 0) {
      out.push('', group(name), ...rows);
    }
  }

  return out;
};

type Renderer<E extends NotifyEvent> = (e: E) => string;

// Значок и его закон живут в events.ts: от него зависит и звук.

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
/**
 * What to call the thing that ran. The workflow's own name first — it is the
 * only text here that identifies THIS run. Then the caller's own word for the
 * mechanism (`manual, from the Mac`). Last resort `the run`, and only when a
 * link exists: losing the link to the logs on a red card is the one loss this
 * format cannot afford, and a row that says nothing is still better than a
 * card with nowhere to click. No live sender reaches that last resort — the
 * GitHub Action always fills the workflow name, and the hand-run scripts send
 * no run link at all.
 */
const mechanism = (
  workflowName: string | undefined,
  via: string | undefined,
  runUrl: string | undefined
): string | undefined => workflowName ?? via ?? (runUrl ? 'the run' : undefined);

// The name of what ran sits WITH the type line, not eight lines below it.
// `Deploy: fail` and `by what means it ran` answer one question, and the owner
// read the two rows as unrelated things. It used to be one fact split in two:
// `Via: GitHub Actions` in the middle of the card and a trailing
// `Workflow: <run>` in the actions block. On one-q that trailing row rendered
// `Workflow: Deploy` — the link text repeating the word on line 2 and naming
// nothing.
//
// The link text is the workflow's OWN name, never the platform: `GitHub
// Actions` is identical on every card in every repository, so clicking it told
// the owner nothing about where he was going. `manual, from the Mac` stays
// unlinked, because a hand deploy has no run to open.
const renderDeploy: Renderer<Extract<NotifyEvent, { type: 'deploy' }>> = (e) => {
  const icon = iconFor(e);
  const runUrl = e.workflowUrl ?? e.url;

  return join([
    typeLine(icon, 'Deploy', e.status),
    fieldLink('Via', runUrl, mechanism(e.workflowName, e.via, runUrl)),
    ...twoBlocks(
      [field('Target', e.target), field('Reason', e.note)],
      [fieldLink('Commit', e.commitUrl, e.commit), titleField(e.commitTitle), bodyQuote(e.commitBody)]
    )
  ]);
};

const renderJob: Renderer<Extract<NotifyEvent, { type: 'job' }>> = (e) => {
  const icon = iconFor(e);
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
    field('Expected', e.expected),
    // `Last run` when the task is alive, `Last seen` when it is not: the same
    // timestamp answers two different questions.
    field(e.status === 'silent' ? 'Last seen' : 'Last run', e.lastSeen),
    ...labelled(e.stats),
    hasItems ? '' : null,
    // Heading ONLY for `disabled`. It used to print for any job carrying a
    // list, so playhub's daily card of newly published games was headed
    // "Disabled workflows".
    disabledList ? group('Disabled workflows') : null,
    ...(hasItems ? bullets(e.items, disabledList) : []),
    e.command || e.logs ? '' : null,
    fieldCode('Log', e.logs),
    ...fieldRun(e.command, e.commandNote),
    // Kept only when the caller actually names the workflow — a named row is a
    // second, different destination; an unnamed one repeats the Task link.
    e.workflowName && (e.workflowUrl ?? e.url) ? '' : null,
    e.workflowName ? fieldAction('Workflow', e.workflowUrl ?? e.url, e.workflowName) : null
  ]);
};

const renderReport: Renderer<Extract<NotifyEvent, { type: 'report' }>> = (e) => {
  if (e.groups && e.groups.length > 0) {
    const body = e.groups.flatMap((g, i) => (i === 0 ? renderGroup(g) : ['', ...renderGroup(g)]));

    // `lines` и `groups` вместе, а не «или»: раньше ветка с группами печатала
    // ТОЛЬКО группы, и цифры отчёта молча исчезали. Поймано 25.08.2026 при
    // переводе утреннего отчёта PlayHub на типизированное событие.
    const numbers = labelled(e.lines);

    return join([
      typeLine(iconFor(e), 'Report', e.title, e.url),
      // Период стоит ВПЛОТНУЮ к названию, без пустой строки, по тому же
      // закону, что `Via` у выкатки и `Check` у проверки: строка, которая
      // уточняет вторую строку, живёт рядом с ней, а не в блоке фактов.
      // Владелец: «период пошёл не туда, он же должен быть рядом с датой».
      field('Period', e.period),
      '',
      ...numbers,
      body.length > 0 ? '' : null,
      ...body
    ]);
  }

  const items = bullets(e.items, false);

  return join([
    // Both analytics jobs send a link to the day's snapshot in docs/. It used to
    // hang off a trailing `Details: open` row; now it is the report's own name.
    typeLine(iconFor(e), 'Report', e.title, e.url),
    // Вплотную к названию — см. соседнюю ветку.
    field('Period', e.period),
    '',
    ...labelled(e.lines),
    items.length > 0 ? '' : null,
    ...items
  ]);
};

// Same law as the deploy card, one row up: what ran is named beside the type
// line and carries the link to its run. The label is `Check` and not `Via`
// because here the name answers WHICH gate spoke — `nightly`, `Quality` —
// while on a deploy it answers by what means the code was shipped.
const renderCi: Renderer<Extract<NotifyEvent, { type: 'ci' }>> = (e) => {
  const icon = iconFor(e);
  const runUrl = e.workflowUrl ?? e.url;

  return join([
    typeLine(icon, 'CI', e.status),
    fieldLink('Check', runUrl, mechanism(e.workflowName, undefined, runUrl)),
    ...twoBlocks(
      [field('Actor', e.actor), field('Reason', e.note)],
      [fieldLink('Commit', e.commitUrl, e.commit), titleField(e.commitTitle), bodyQuote(e.commitBody)]
    )
  ]);
};

const renderPr: Renderer<Extract<NotifyEvent, { type: 'pr' }>> = (e) =>
  join([
    typeLine(iconFor(e), 'PR', e.action),
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
    typeLine(iconFor(e), 'Issue', e.action),
    '',
    fieldLink('Number', e.url, `#${e.number}`),
    titleField(e.title),
    bodyQuote(e.body),
    field('Author', e.author),
    field('Assignee', e.assignee)
  ]);

const renderIncident: Renderer<Extract<NotifyEvent, { type: 'incident' }>> = (e) =>
  join([
    typeLine(iconFor(e), 'Incident', 'open'),
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
// A session in trouble. Same law as every other card: identifier first, then
// the facts as fields, then his own words as a quote — never as a field, which
// keeps one line and clipped the name of the very session the card is about.
const renderSession: Renderer<Extract<NotifyEvent, { type: 'session' }>> = (e) =>
  join([
    typeLine(iconFor(e), 'Session', e.action),
    '',
    field('Id', e.id),
    field('Project', e.workdir),
    field('Reason', e.reason),
    e.opened ? '' : null,
    quoted('Opened with', e.opened),
    e.command ? '' : null,
    ...fieldRun(e.command, e.commandNote)
  ]);

const renderHeartbeatMiss: Renderer<Extract<NotifyEvent, { type: 'heartbeat_miss' }>> = (e) => {
  const icon = iconFor(e);
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

const RENDERERS: { [K in NotifyEvent['type']]: Renderer<Extract<NotifyEvent, { type: K }>> } = {
  deploy: renderDeploy,
  job: renderJob,
  report: renderReport,
  ci: renderCi,
  pr: renderPr,
  issue: renderIssue,
  incident: renderIncident,
  session: renderSession,
  heartbeat_miss: renderHeartbeatMiss
};

// Тег наверху карточки И машинный ключ разборщика — ОДНО И ТО ЖЕ значение
// (решение владельца 20.08.2026): раньше это были два разных представления
// одного факта (снизу — дефисный `#ci-arvent`, сверху — теги вручную), и это
// читалось как дублирование. Разделитель — подчёркивание, не дефис: дефис
// разрывает Telegram-хэштег на середине слова (`#mac-config` линкуется
// только как `#mac`), а тег ДОЛЖЕН быть кликабельным — это и есть фильтр
// «показать всю историю этого экземпляра», которым владелец пользуется вживую.
export const slug = (raw: string): string =>
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
  session: 'session',
  heartbeat_miss: 'heartbeat'
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
        return slug(e.title);
      // NOT the session id: an id is unique per session, so the tag would be
      // new every time and nothing could ever be paired with anything.
      case 'session':
        return slug(e.action);
      case 'pr':
        return `p${e.number}`;
      case 'issue':
        return `i${e.number}`;
    }
  };

  return e.key ? slug(e.key) : fallback();
};

/**
 * Третий тег — ИСХОД, и он есть всегда. Владелец: «не хватает тега fail или
 * похожего, чтобы фейлы можно было группировать и ок можно было группировать».
 * Одно нажатие в Telegram собирает все падения проекта разом, каким бы типом
 * они ни пришли — выкатка, проверка, задача по расписанию, авария.
 *
 * Значение берётся у ЗНАЧКА, а не у слова статуса, и это не мелочь: значок уже
 * единственный источник правды про звук, и второй список «что считать
 * падением» разошёлся бы с первым — так уже было, когда красная карточка
 * приходила беззвучной. Громкий значок — `#fail`, зелёный — `#ok`, всё
 * остальное (завели задачу, открыли PR, попросили правки, отчёт) — `#news`:
 * это новость, а не приговор робота.
 */
const OK_ICONS: ReadonlySet<string> = new Set([ICON.ok, ICON.landed, ICON.approved]);

const outcomeTag = (e: NotifyEvent): string => {
  const icon = iconFor(e);
  if (LOUD.has(icon)) {
    return 'fail';
  }

  return OK_ICONS.has(icon) ? 'ok' : 'news';
};

const tagsLine = (e: NotifyEvent): string =>
  `#${TYPE_TAG[e.type]} #${esc(eventKey(e))} #${outcomeTag(e)}`;

/**
 * Строка тегов для свободного HTML (`sendReport`). Тег — это ФИЛЬТР владельца,
 * и к формату тела он отношения не имеет: дневной отчёт остаётся свободным
 * текстом, но перестаёт быть единственной карточкой без тегов. Раньше ключ
 * висел хвостом в `<i><code>#ключ</code></i>` — это старый формат, до того как
 * теги переехали первой строкой.
 */
export const reportTags = (key: string): string => `#report #${esc(slug(key))}`;

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
  // Карточка с вложением — это подпись, поэтому бюджет выбирается по `path`.
  const budget = Math.max(64, e.path ? 1024 - tags.length - 40 : 4000 - tags.length - 1);

  return `${tags}\n${clampMessage(renderer(e), budget)}`;
};
