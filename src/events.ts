/**
 * Каталог событий — единственная точка входа для отправки. `notify()` (см.
 * `send.ts`) принимает ТОЛЬКО значения этого типа: свободного текста в API
 * нет, значит «своё» сообщение технически не написать.
 *
 * Правило эволюции схемы (версии нет и не будет — сообщение живёт секунду и
 * читается глазами, версионировать нечего):
 *   - новое поле у СУЩЕСТВУЮЩЕГО типа добавляется ТОЛЬКО опциональным;
 *   - обязательные поля не добавляются никогда — только новый тип события.
 * Тогда старый вызывающий код и новый пакет совместимы в обе стороны.
 */

// `vault` — не продукт, а инфраструктура: сейф секретов. Форум ему нужен по той
// же причине, что и проектам: роботу надо куда-то писать. Людей там нет.
export type Project = 'playhub' | 'one-q' | 'arvent' | 'game-publisher' | 'vault' | 'mac-config' | 'alitools';

/**
 * Стабильный машинный ключ задачи — последняя строка каждой карточки, вида
 * `#ключ` (без названия проекта: карточка и так лежит в форуме своего
 * проекта — `targets()` не шлёт её в чужой). По нему дневной разборщик
 * сверяет «это 🔴 уже закрыто более поздней карточкой того же ключа?» без
 * сравнения человеческих формулировок, которые меняются. Необязателен: без
 * него ключ выводится из типа и заголовка (см. `render.ts`), но выведенный
 * наследует хрупкость формулировки — наши регулярные отправители передают
 * его явно. В вывод CLI (stderr, и его же сторож на VPS читает объединённым
 * потоком по словам `sent|failed|skipped`) ключ не попадает никогда — новое
 * слово там ослепило бы сторожа.
 */
/**
 * Общая часть любого события. `path` — локальный файл, который едет ВМЕСТЕ с
 * карточкой: карточка становится подписью к вложению. Отдельного вида `file`
 * нет с 25.08.2026 — прогон Arvent слал вердикт и лог двумя карточками про
 * одну новость.
 */
type Keyed = {
  key?: string;
  /** Локальный файл; карточка уедет как подпись к нему (лимит подписи 1024). */
  path?: string;
  /** Имя файла в чате; по умолчанию — имя из `path`. */
  filename?: string;
};

/**
 * Позиция списка внутри сообщения: задача из дайджеста, упавшая проверка,
 * замечание. `url` необязателен — тогда рендерится просто строкой.
 */
/**
 * `label` — необязательный жирный префикс перед `text` (`#243 (overdue)`,
 * `#287`) для позиций внутри именованных групп отчёта. Без `label` позиция
 * рендерится как обычная нумерованная/маркированная строка — так уже
 * работают дайджест-задачи и список выключенных workflow.
 */
export type Item = { text: string; url?: string; label?: string };

export type NotifyEvent = Keyed &
  (
  /** Выкатка кода на сервер. */
  | {
      type: 'deploy';
      project: Project;
      status: 'ok' | 'fail';
      commit?: string;
      /** Ссылка на коммит — строка «коммит» становится кликабельной. */
      commitUrl?: string;
      /** Заголовок коммита — рендерится полем `Title:`, тело идёт цитатой ниже. */
      commitTitle?: string;
      /** Тело коммита, если есть — та же цитата, что и заголовок. */
      commitBody?: string;
      workflowUrl?: string;
      /** Название прогона для видимого текста ссылки (по умолчанию — `open`). */
      workflowName?: string;
      url?: string;
      /**
       * Куда выкатили. Заполнять ТОЛЬКО когда окружений больше одного: у сайтов
       * с единственным продом «куда: прод» — строка, которую читают глазами и
       * ничего из неё не узнают.
       */
      target?: string;
      /**
       * Откуда запустили: «вручную с Mac», «GitHub Actions». Вот это как раз
       * новость — путей выкатки два, они дают разные последствия (ручной идёт
       * с ноутбука и переменные берёт из локального .env), и по карточке видно,
       * какой сработал.
       */
      via?: string;
      /** Пояснение: почему отменён/пропущен прогон после деплоя. */
      note?: string;
    }
  /** Регулярная задача по расписанию: импорт игр, бэкап БД, валидатор. */
  | {
      type: 'job';
      project: Project;
      job: string;
      /**
       * `disabled` — задача выключена извне (например GitHub Actions кончил
       * бесплатные минуты), не провалилась сама.
       *
       * `silent` — задача не отчиталась в срок: она не упала, она вообще не
       * подала признаков жизни. Это состояние ЗАДАЧИ, а не отдельный вид
       * события — оно жило типом `heartbeat_miss`, и владелец справедливо
       * спросил, почему задача по расписанию у него под двумя разными тегами.
       * Хуже того: сторож молчания шлёт тот же машинный ключ, что и сама
       * задача, так что красная карточка `#heartbeat #daily_import` не
       * закрывалась зелёной `#job #daily_import` — разборщик ищет пару по
       * ПОЛНОМУ тегу. Один поток на задачу это чинит.
       */
      status: 'ok' | 'fail' | 'disabled' | 'silent';
      /** Как часто задача обязана отмечаться — для `silent` и для возврата из него. */
      expected?: string;
      /** Когда её видели в последний раз. */
      lastSeen?: string;
      stats?: Array<[label: string, value: string | number]>;
      /** Детали: что именно упало, замечания прогона; у `disabled` — список выключенных процессов (каждый со своей ссылкой). */
      items?: Item[];
      note?: string;
      /**
       * A command for him to run, rendered monospaced so Telegram makes it
       * tap-to-copy. For the case where the card names something on this Mac
       * that no URL can reach — a stopped local session, a latch file.
       */
      command?: string;
      /**
       * WHAT that command does. The owner, on a bare `rm` in a card: "я сейчас
       * введу её и сделаю хуй пойми что, я ж не знаю, что делаю". A command he
       * cannot read is one he cannot run, so it never travels alone.
       */
      commandNote?: string;
      /**
       * A local log path — monospaced, not a link, same as on an incident.
       * It used to be glued onto the end of the reason sentence behind a
       * colon, which is what made a red card read as one long run-on line.
       */
      logs?: string;
      workflowUrl?: string;
      /** Название прогона для видимого текста ссылки (по умолчанию — `open`). */
      workflowName?: string;
      /**
       * Запасное имя для ссылки на прогон: половина отправителей шлёт её как
       * `--url`. Рендер берёт `workflowUrl ?? url`, так что оба имени работают.
       * В новых вызовах предпочитай `workflowUrl` — оно говорит, куда ведёт.
       */
      url?: string;
    }
  /** Сводка с цифрами: дневной отчёт, дайджест аналитики. */
  | {
      type: 'report';
      project: Project;
      title: string;
      period?: string;
      /** Пусто/не передано, когда используются `groups` — два вида отчёта не смешиваются в одном событии. */
      lines?: Array<[label: string, value: string | number]>;
      /**
       * Список позиций со ссылками — для дайджестов задач, где ценность в
       * самих названиях, а не в цифре. Рендерятся отдельным блоком после
       * `lines`.
       */
      items?: Item[];
      /**
       * Именованные группы (доска задач: Ready/In Progress/Not on the
       * board; аналитика: Metrics/Links) — каждая со своим заголовком и
       * списком позиций. Заменяет `lines`/`items`, когда задан: разные
       * отчёты используют либо плоский вид, либо группы, не оба разом.
       */
      groups?: Array<{ name: string; items: Item[] }>;
      url?: string;
    }
  /** Итог CI на основной ветке. */
  | {
      type: 'ci';
      project: Project;
      status: 'ok' | 'fail';
      branch?: string;
      commit?: string;
      /** Ссылка на коммит — хэш становится кликабельным. */
      commitUrl?: string;
      /** Заголовок коммита (subject) — отдельное поле `Title:`, не цитата. */
      commitTitle?: string;
      /** Тело коммита (после subject) — та же цитата, что и заголовок. */
      commitBody?: string;
      actor?: string;
      /**
       * Why this run happened, when there is no commit to point at: a nightly
       * schedule, a manual press. Renders as `Reason:`, same as on deploy.
       */
      note?: string;
      /** Ссылка на прогон (workflow run) — отдельно от `url` — запасной для `workflowUrl`. */
      workflowUrl?: string;
      /** Название прогона для видимого текста ссылки (по умолчанию — `open`). */
      workflowName?: string;
      url?: string;
    }
  /**
   * Событие пул-реквеста. Виды покрывают весь путь PR, потому что владелец
   * следит за работой команды по вкладке Ops, а не по почте: почта приходит
   * только когда тебя позвали лично, и половина событий в неё не попадает.
   */
  | {
      type: 'pr';
      project: Project;
      action:
        | 'opened'
        | 'approved'
        | 'changes_requested'
        | 'merged'
        | 'closed';
      number: number;
      title: string;
      /** PR description — quoted on its own; the title is the `Title:` field above it. */
      body?: string;
      author?: string;
      reviewer?: string;
      url?: string;
    }
  /** Событие задачи: заведена, взята в работу, закрыта. */
  | {
      type: 'issue';
      project: Project;
      action: 'opened' | 'assigned' | 'closed';
      number: number;
      title: string;
      /** Тело задачи — цитата под полем `Title:`, отдельно от заголовка. */
      body?: string;
      author?: string;
      assignee?: string;
      url?: string;
    }
  /** Приложение сломалось прямо сейчас (рантайм-алерт). */
  | {
      type: 'incident';
      project: Project;
      title: string;
      detail?: string;
      /** Локальный путь к логам (не URL — рендерится моноширинным, для копирования, не для клика). */
      logs?: string;
      url?: string;
    }
  /**
   * A working session on this Mac is in trouble — not a job, not a workflow.
   * It went out as `job` at first and read wrong: `#job` promises something
   * scheduled that ran and failed, and the owner rightly asked what a burning
   * session was doing under that heading.
   *
   * What makes it its own type rather than an `incident`: a session has an
   * identity nothing else here has — an id, a working directory, and the line
   * he typed to start it, which is the ONLY thing that tells two of his open
   * sessions apart.
   */
  | {
      type: 'session';
      project: Project;
      /** What happened, as the second line reads it: `Session: burning the limit`. */
      action: string;
      /** The session's own id — the identifier field, first, as everywhere else. */
      id?: string;
      /** Working directory name, when several sessions opened with a similar line. */
      workdir?: string;
      /** One line of measurement: what the guard saw. */
      reason?: string;
      /**
       * The line he opened the session with. Quoted, never a field: it is his
       * own writing, it runs long, and a field would clip it to one short line
       * — which is exactly how the first version of this card lost it.
       */
      opened?: string;
      /** A command for him to run, monospaced so Telegram makes it copyable. */
      command?: string;
      /** WHAT that command does — see the note on `job.commandNote`. */
      commandNote?: string;
      /** `fail` red, `ok` green — a session that recovered is not an alarm. */
      status?: 'fail' | 'ok';
    }
  /**
   * УСТАРЕЛО с 1.4.2: используйте `job` со статусом `silent`. Тип остаётся,
   * потому что сторож молчания живёт на сервере и до выкатки шлёт именно его —
   * убрать значит потерять карточку молчания ровно тогда, когда она нужна.
   * Новых вызовов не добавлять.
   */
  | {
      type: 'heartbeat_miss';
      project: Project;
      job: string;
      lastSeen?: string;
      expected?: string;
      /** Задача снова отчиталась — тот же тип, зелёная карточка вместо красной, ключ (для сверки) не меняется. */
      recovered?: boolean;
      /** Готовое предложение-причина; без него собирается из lastSeen/expected. */
      note?: string;
    }
  );

export type EventType = NotifyEvent['type'];

/** Красное = со звуком. Всё остальное — тихо. (Отдельной темы «инциденты» больше нет — авария видна в ленте проекта.) */
/**
 * Словарь значков. Два закона, и оба поставлены владельцем 25.08.2026:
 *
 * 1. ВНУТРИ одного тега у каждого слова свой значок. Раньше значков было
 *    ровно четыре на весь пакет, и `Issue: opened` с `Issue: assigned`
 *    выглядели одинаково, а у задачи три разных беды — fail, disabled,
 *    silent — были одним и тем же красным кругом.
 * 2. МЕЖДУ тегами одинаковый смысл выглядит одинаково. `fail` — это 🔴 и в
 *    выкатке, и в CI, и в задаче; «появилось новое» — 🆕 и у задачи на доске,
 *    и у PR, и у файла.
 *
 * И третий, который держит первые два честными: у значка фиксированный звук.
 * Не у события, не у статуса — у значка. Пока звук выводился отдельным
 * правилом, `🔴 PR: changes_requested` приходила беззвучно.
 */
export const ICON = {
  ok: '✅',        // passed, closed, done
  red: '🔴',       // broken
  alarm: '🚨',     // burning right now
  off: '🚫',       // switched off — it will not run until someone turns it back on
  unknown: '❓',   // did not report: alive or dead is unknown
  fresh: '🆕',     // something new appeared
  taken: '🙋',     // someone took it
  landed: '🎉',    // merged — the work is in
  discarded: '🗑️', // closed without reaching the result
  approved: '👍',  // a human approved it
  changes: '📝',   // a human wants edits — not a failure, and not loud
  info: 'ℹ️'       // a summary, for information
} as const;

/** The sound is a property of the icon, and of nothing else. */
export const LOUD: ReadonlySet<string> = new Set([ICON.red, ICON.alarm, ICON.off, ICON.unknown]);

export const PR_ICON: Record<Extract<NotifyEvent, { type: 'pr' }>['action'], string> = {
  opened: ICON.fresh,
  approved: ICON.approved,
  changes_requested: ICON.changes,
  merged: ICON.landed,
  closed: ICON.discarded
};

export const ISSUE_ICON: Record<Extract<NotifyEvent, { type: 'issue' }>['action'], string> = {
  opened: ICON.fresh,
  assigned: ICON.taken,
  closed: ICON.ok
};

const JOB_ICON: Record<Extract<NotifyEvent, { type: 'job' }>['status'], string> = {
  ok: ICON.ok,
  fail: ICON.red,
  disabled: ICON.off,
  silent: ICON.unknown
};

/** Одно место, где решается значок карточки, — и рендер, и звук берут его отсюда. */
export const iconFor = (e: NotifyEvent): string => {
  switch (e.type) {
    case 'deploy':
    case 'ci':
      return e.status === 'ok' ? ICON.ok : ICON.red;
    case 'job':
      return JOB_ICON[e.status];
    case 'session':
      return e.status === 'ok' ? ICON.ok : ICON.alarm;
    case 'incident':
      return ICON.alarm;
    case 'heartbeat_miss':
      return e.recovered ? ICON.ok : ICON.unknown;
    case 'pr':
      return PR_ICON[e.action];
    case 'issue':
      return ISSUE_ICON[e.action];
    case 'report':
      return ICON.info;
  }
};

export const severity = (e: NotifyEvent): 'info' | 'error' => {
  // ONE law: the icon decides the sound. There is no second list of "which
  // events are bad" to keep in sync with the icons — keeping two lists is how
  // `🔴 PR: changes_requested` ended up arriving MUTED, the only red card in
  // the package that did not ring, because severity() looked at `status` and a
  // pull request has an `action`.
  return LOUD.has(iconFor(e)) ? 'error' : 'info';
};
