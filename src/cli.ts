#!/usr/bin/env node
/**
 * `notify <type> [--flag value]...` — тонкий диспетчер. Ноль зависимостей:
 * разбор аргументов написан руками (не yargs/commander), потому что здесь
 * нужно ровно два вида флагов (одиночный и повторяемый `key=value`).
 *
 * Код возврата ВСЕГДА 0 — уведомление не имеет права уронить вызвавший его
 * деплой или задачу. Все ошибки — только в stderr. Исключения намеренно нет
 * (см. docs/rollout.md «чего не делаем»): сценария, где деплой должен упасть
 * из-за неотправленного сообщения, не существует.
 *
 *   notify deploy   --project playhub --status ok --commit "msg" [--commit-url "..."] --url "..."
 *   notify job      --project playhub --job "Импорт игр" --status ok --stat "добавлено=5"
 *   notify report   --project playhub --title "Сводка за день" --line "Игр=1284"
 *   notify ci       --project arvent  --status fail --branch master --actor saz_sam
 *   notify pr       --project arvent  --action opened --number 142 --title "..."
 *   notify incident --project arvent  --title "Redis недоступен" --detail "$ERR"
 *   notify file     --project arvent  --title "Полные диалоги" --path ./out.txt [--filename имя.txt]
 *   notify <type> [--key стабильный-ключ]   # ключ задачи в последней строке карточки
 *   notify <type> --json < payload.json   # весь объект события со stdin
 *   notify setup <chat_id форума> <ключ-проекта>   # создать вкладки, см. setup.ts
 */
import { readFileSync } from 'node:fs';
import type { NotifyEvent, Project } from './events.ts';
import { KNOWN_FLAGS } from './cli-flags.ts';
import { render } from './render.ts';
import { notify } from './send.ts';
import { setupTopic } from './setup.ts';

const log = (msg: string): void => console.error(`[notify] ${msg}`);

/**
 * Anything taken from the caller and echoed into a message goes through this.
 *
 * `sent`, `failed` and `skipped` are a CONTRACT: `notify-fail.sh` greps
 * `^\[notify\] sent$`, the server-side silence watchdog matches `*sent*`, and
 * `action.yml` warns on `*failed*|*skipped*`. An input value carrying one of
 * those words puts it on stderr — `notify sent --project=x` printed
 * `unknown event type: sent`, and the watchdog read a card that was never
 * delivered as delivered, then stopped repeating the alarm. Found by Codex,
 * 25.08.2026.
 */
const safe = (v: unknown): string =>
  String(v ?? '').replace(/\b(sent|failed|skipped)\b/gi, (w) => `${w[0]}·${w.slice(1)}`);

const args = process.argv.slice(2);
const command = args[0];

if (command === 'setup') {
  const [, chatId, projectKey] = args;

  if (!chatId || !projectKey) {
    log('usage: notify setup <forum chat_id> <project key>');
    log('  create the group first, turn Topics on in it, add the bot as admin');
    process.exit(0);
  }

  await setupTopic(chatId, projectKey);
  process.exit(0);
}

const flags = new Map<string, string[]>();
const parseErrors: string[] = [];

/** Флаги без значения. Всё остальное обязано его иметь. */
const BOOLEAN_FLAGS = new Set(['json', 'recovered', 'dry-run']);

for (let i = 1; i < args.length; i++) {
  const arg = args[i];

  if (!arg.startsWith('--')) {
    parseErrors.push(`stray argument with no flag: "${safe(arg)}"`);
    continue;
  }

  // Форма `--key=value` обязательна для значений, начинающихся с `--`
  // (текст ошибки, кусок диффа): иначе они были бы съедены как флаги.
  const eq = arg.indexOf('=');

  if (eq !== -1) {
    const key = arg.slice(2, eq);
    flags.set(key, [...(flags.get(key) ?? []), arg.slice(eq + 1)]);
    continue;
  }

  const key = arg.slice(2);

  if (BOOLEAN_FLAGS.has(key)) {
    flags.set(key, ['true']);
    continue;
  }

  const next = args[i + 1];

  // Раньше флаг без значения молча становился строкой 'true'. Отсюда
  // `--url` в конце команды давал `href="true"`, Telegram отвечал 400 и
  // ТЕРЯЛОСЬ ВСЁ сообщение, а `--status` без значения рисовал 🔴 на
  // успешном деплое. Теперь это явная ошибка разбора.
  if (next === undefined || next.startsWith('--')) {
    parseErrors.push(`flag --${safe(key)} with no value`);
    continue;
  }

  i++;
  flags.set(key, [...(flags.get(key) ?? []), next]);
}


const one = (key: string): string | undefined => flags.get(key)?.[0];

for (const key of flags.keys()) {
  if (!KNOWN_FLAGS.has(key)) {
    parseErrors.push(`unknown flag --${safe(key)}`);
  }
}

// Число с явной ошибкой разбора, иначе рендер рисовал «PR #NaN».
const num = (key: string): number => {
  const raw = one(key);
  const n = Number(raw);

  if (raw === undefined || Number.isNaN(n)) {
    parseErrors.push(`--${safe(key)}: expected a number, got "${safe(raw)}"`);

    return 0;
  }

  return n;
};

/**
 * `--item "текст"` или `--item "текст|https://ссылка"`.
 *
 * Имя группы у позиции нельзя передать так же, как у `--stat`: черта здесь
 * уже занята ссылкой. Поэтому `--item-group "Red checks"` — одно имя на все
 * позиции этого вызова. Списки у отправителей однородные (красные проверки,
 * выключенные процессы), а разнородный список — это `--json`.
 */
const items = (): Array<{ text: string; url?: string; group?: string }> => {
  const name = flags.get('item-group')?.[0];

  return (flags.get('item') ?? []).map((raw) => {
    const idx = raw.lastIndexOf('|');
    const base =
      idx === -1 ? { text: raw } : { text: raw.slice(0, idx), url: raw.slice(idx + 1) };

    return name ? { ...base, group: name } : base;
  });
};
/**
 * `--stat "label=value"`, и с 25.08.2026 — `--stat "Group | label=value"`:
 * имя группы, вертикальная черта, ярлык. Черта выбрана потому, что её нет ни
 * в одном живом ярлыке, а двоеточие есть («Eval: bot answer quality») и
 * равенство занято значением. Пробелы вокруг черты необязательны.
 *
 * Без черты всё как было — так шлют больше двадцати отправителей, и ни один
 * из них менять не нужно.
 */
const pairs = (key: string): Array<[string, string, string?]> =>
  (flags.get(key) ?? []).map((s) => {
    const idx = s.indexOf('=');
    const head = idx === -1 ? s : s.slice(0, idx);
    const value = idx === -1 ? '' : s.slice(idx + 1);
    const bar = head.indexOf('|');

    return bar === -1
      ? ([head, value] as [string, string, string?])
      : ([head.slice(bar + 1).trim(), value, head.slice(0, bar).trim()] as [string, string, string?]);
  });

const project = (): Project => one('project') as Project;

/**
 * GitHub называет действия своими словами, и одно наше событие собирается из
 * двух разных его событий: `pull_request` (opened/closed/…) и
 * `pull_request_review` (submitted + state). Поэтому принимаем и сырые имена
 * GitHub, и наши.
 *
 * Неизвестное действие — ОШИБКА, а не «сойдёт за opened». Молчаливая подмена
 * означала бы, что «запрошены правки» приедет как «открыт», и владелец увидит
 * не то, что произошло, — а он именно по этой ленте следит за работой команды.
 */
type PrAction = Extract<NotifyEvent, { type: 'pr' }>['action'];
type IssueAction = Extract<NotifyEvent, { type: 'issue' }>['action'];

const PR_ALIASES: Record<string, PrAction> = {
  opened: 'opened',
  reopened: 'opened',
  // A PR that is already announced is not announced again: both of these mean
  // "this PR now wants eyes", which is what `opened` already says.
  ready_for_review: 'opened',
  review_requested: 'opened',
  approved: 'approved',
  changes_requested: 'changes_requested',
  merged: 'merged',
  closed: 'closed'
};

const ISSUE_ALIASES: Record<string, IssueAction> = {
  opened: 'opened',
  reopened: 'opened',
  assigned: 'assigned',
  closed: 'closed'
};

// Ошибка кладётся в parseErrors — тот же путь, что у остального разбора: ниже
// он печатает все ошибки разом и выходит ДО отправки. Значение-заглушка нужно
// только чтобы удовлетворить тип, до сети оно не доживёт.
const prAction = (raw: string | undefined): PrAction => {
  const hit = PR_ALIASES[(raw ?? '').toLowerCase()];

  if (!hit) {
    parseErrors.push(`--action: unknown PR action "${safe(raw)}" (${Object.keys(PR_ALIASES).join(', ')})`);

    return 'opened';
  }

  return hit;
};

const issueAction = (raw: string | undefined): IssueAction => {
  const hit = ISSUE_ALIASES[(raw ?? '').toLowerCase()];

  if (!hit) {
    parseErrors.push(
      `--action: unknown issue action "${raw ?? ''}" (${Object.keys(ISSUE_ALIASES).join(', ')})`
    );

    return 'opened';
  }

  return hit;
};

/**
 * Всё, что не признано успехом, считается провалом.
 *
 * Тут важна не строгость, а согласованность: раньше `--status success`
 * (естественная опечатка при ручном вызове) рисовал 🔴 «упал», но `severity()`
 * видел «не fail» и слал сообщение БЕЗ звука. Красная плашка без звука —
 * худший исход: авария выглядит аварией, но не будит.
 */
const status = (): 'ok' | 'fail' => {
  const raw = (one('status') ?? '').toLowerCase();

  return raw === 'ok' || raw === 'success' || raw === 'passed' || raw === '0' ? 'ok' : 'fail';
};

// `job` — единственный тип с третьим состоянием (`disabled`): задача не
// провалилась сама, её выключил кто-то извне (GitHub Actions без минут).
const jobStatus = (): 'ok' | 'fail' | 'disabled' | 'silent' => {
  const raw = (one('status') ?? '').toLowerCase();

  if (raw === 'disabled') {
    return 'disabled';
  }

  if (raw === 'silent') {
    return 'silent';
  }

  return raw === 'ok' || raw === 'success' || raw === 'passed' || raw === '0' ? 'ok' : 'fail';
};

let event: NotifyEvent | undefined;

if (flags.has('json')) {
  try {
    const payload = JSON.parse(readFileSync(0, 'utf-8')) as Record<string, unknown>;

    // type — за командой, не за payload: иначе --pr <объект с type:deploy>
    // отправил бы событие другого типа.
    event = { ...payload, type: command } as NotifyEvent;
  } catch (err) {
    // Тоже в parseErrors: обе аналитики зовут CLI через `|| true`, и молчащий
    // разбор JSON означал бы зелёный крон без дневного отчёта.
    parseErrors.push(`--json from stdin did not parse: ${safe(err instanceof Error ? err.message : err)}`);
  }
} else {
  switch (command) {
    case 'deploy':
      event = {
        type: 'deploy',
        project: project(),
        status: status(),
        commit: one('commit'),
        commitUrl: one('commit-url'),
        commitTitle: one('commit-title'),
        commitBody: one('commit-body'),
        workflowUrl: one('workflow-url'),
        workflowName: one('workflow-name'),
        url: one('url'),
        target: one('target'),
        via: one('via'),
        note: one('note')
      };
      break;
    case 'job':
      event = {
        type: 'job',
        project: project(),
        job: one('job') ?? '(no name)',
        status: jobStatus(),
        aside: one('aside'),
        expected: one('expected'),
        lastSeen: one('last-seen'),
        stats: pairs('stat'),
        items: items(),
        note: one('note'),
        command: one('command'),
        commandNote: one('command-note'),
        logs: one('logs'),
        workflowUrl: one('workflow-url'),
        workflowName: one('workflow-name'),
        url: one('url')
      };
      break;
    case 'report':
      event = {
        type: 'report',
        project: project(),
        title: one('title') ?? '(no title)',
        // `--period` is the old spelling of `--aside`; both fill the same
        // slot, and two senders still use the old one.
        aside: one('aside') ?? one('period'),
        lines: pairs('line'),
        items: items(),
        url: one('url')
      };
      break;
    case 'ci':
      event = {
        type: 'ci',
        project: project(),
        status: status(),
        branch: one('branch'),
        commit: one('commit'),
        commitUrl: one('commit-url'),
        commitTitle: one('commit-title'),
        commitBody: one('commit-body'),
        actor: one('actor'),
        note: one('note'),
        workflowUrl: one('workflow-url'),
        workflowName: one('workflow-name'),
        url: one('url')
      };
      break;
    case 'pr':
      event = {
        type: 'pr',
        project: project(),
        action: prAction(one('action')),
        number: num('number'),
        title: one('title') ?? '(no title)',
        body: one('body'),
        author: one('author'),
        reviewer: one('reviewer'),
        url: one('url')
      };
      break;
    case 'issue':
      event = {
        type: 'issue',
        project: project(),
        action: issueAction(one('action')),
        number: num('number'),
        title: one('title') ?? '(no title)',
        body: one('body'),
        author: one('author'),
        assignee: one('assignee'),
        url: one('url')
      };
      break;
    case 'session':
      event = {
        type: 'session',
        project: project(),
        action: one('action') ?? 'in trouble',
        id: one('id'),
        workdir: one('workdir'),
        reason: one('reason'),
        opened: one('opened'),
        command: one('command'),
        commandNote: one('command-note'),
        // Only two states here, so `disabled` must not leak in from jobStatus.
        status: jobStatus() === 'ok' ? 'ok' : 'fail'
      };
      break;
    case 'incident':
      event = {
        type: 'incident',
        project: project(),
        title: one('title') ?? '(no title)',
        detail: one('detail'),
        logs: one('logs'),
        url: one('url')
      };
      break;
    case 'heartbeat_miss':
      event = {
        type: 'heartbeat_miss',
        project: project(),
        job: one('job') ?? '(no name)',
        lastSeen: one('last-seen'),
        expected: one('expected'),
        recovered: flags.has('recovered'),
        note: one('note')
      };
      break;
    // `file` is no longer a kind of event — an attachment is a property any
    // card may have. The word is kept as an alias so senders that still say
    // `notify file` deliver a report card with the log attached, instead of
    // falling into the unknown-type branch and going silent.
    case 'file':
      event = {
        type: 'report',
        project: project(),
        title: one('title') ?? '(no title)',
        // A file card has no period; the caption is its title.
        lines: []
      };
      break;
    default:
      // В parseErrors, а не просто в лог: иначе неизвестный тип уходил в
      // тишину — событие не собиралось, ошибок разбора не было, и CLI выходил
      // нулём, ничего не отправив и ничего об этом не сказав.
      parseErrors.push(`unknown event type: ${safe(command ?? '(none given)')}`);
  }
}

// --key применим к любому типу — одна точка вместо строки в каждом case
// (девять копий уже потеряли бы десятую). `??`: путь --json может нести
// key в самом объекте, отсутствие флага не должно его затирать.
if (event) {
  event.key = one('key') ?? event.key;
  // --path is applicable to any type too, for the same reason --key is.
  event.path = one('path') ?? event.path;
  event.filename = one('filename') ?? event.filename;
}

if (event?.filename && !event.path) {
  parseErrors.push('--filename: given without --path, so there is no file to name');
}

// Ошибки разбора — до отправки: лучше внятно сказать, что не так с командой,
// чем прислать сообщение с «true» вместо ссылки или 🔴 на успешном деплое.
if (parseErrors.length > 0) {
  for (const err of parseErrors) {
    log(err);
  }
  // The word `failed` is a CONTRACT, not prose. Two readers match on it: the
  // GitHub Action turns it into a yellow annotation, and the VPS watchdog reads
  // the combined stream for `sent|failed|skipped`. Before this, a parse error
  // printed neither word — the run stayed green, the watchdog stayed quiet, and
  // the card simply never existed.
  // It must NOT contain the substring `sent`: heartbeat-check.sh matches `*sent*`
  // and would read a failure as a success.
  log('failed: bad command, nothing delivered');
  process.exit(0);
}

if (event && flags.has('dry-run')) {
  // The rendered card on STDOUT, nothing sent and no token needed. This is how
  // a change to the format is shown to the owner before it reaches a forum, and
  // how ~25 edited call sites are checked one by one — the package always exits
  // 0, so a typo in a flag is otherwise silent.
  //
  // stdout, not stderr: every other line this CLI prints goes to stderr, and
  // watchdogs read that stream for the words `sent|failed|skipped`. A card
  // printed there would be read as a verdict.
  process.stdout.write(`${render(event)}\n`);
  process.exit(0);
}

if (event) {
  // Ловим ВСЁ: уведомление не имеет права уронить деплой или крон, который
  // его вызвал. В bash с `set -e` (или в `trap ... ERR`) ненулевой код здесь
  // завалил бы саму задачу — ровно то, чего пакет обязан не делать.
  try {
    log(await notify(event));
  } catch (err) {
    // Слово `failed` — контракт, тот же, что у ошибки разбора выше. Без него
    // исключение при отправке читалось сторожами как «ничего не случилось».
    log(`failed: ${safe(err instanceof Error ? err.message : err)}`);
  }
}

process.exit(0);
