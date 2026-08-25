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
type Keyed = { key?: string };

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
        | 'ready_for_review'
        | 'review_requested'
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
  /**
   * Файл-вложение (sendDocument) с подписью-карточкой. Появился, когда
   * eval-отчёт Arvent слал файл голым curl мимо пакета: без ретраев файл
   * терялся в любую сетевую икоту, а chat_id и номер вкладки жили копией,
   * которая устаревает молча. Маршрут — тот же `ROUTES`, транспорт — с теми
   * же повторами. Подпись у Telegram ограничена 1024 символами — режется
   * тем же безопасным клампом.
   */
  | {
      type: 'file';
      project: Project;
      title: string;
      /** Путь к локальному файлу. */
      path: string;
      /** Имя файла в чате; по умолчанию — имя из `path`. */
      filename?: string;
      note?: string;
    }
  );

export type EventType = NotifyEvent['type'];

/** Красное = со звуком. Всё остальное — тихо. (Отдельной темы «инциденты» больше нет — авария видна в ленте проекта.) */
/**
 * Значок = СОСТОЯНИЕ, не вид события. Ровно четыре на весь пакет — закреплённая
 * легенда в форумах обещает это владельцу как факт, не как приближение.
 * 🔴 сломалось, 🚨 горит прямо сейчас, ✅ прошло, ℹ️ к сведению.
 *
 * Живёт здесь, а не в render.ts, потому что от значка зависит и звук: одно
 * слово всегда носит один значок, а значок всегда решает, звонить или нет.
 */
export const ICON = { red: '🔴', alarm: '🚨', ok: '✅', info: 'ℹ️' } as const;

// PR/Issue: значок по состоянию, не по действию — `merged`/`approved` = успех,
// `changes_requested` = требует внимания, остальное = к сведению. Слово
// действия само по себе уже говорит, что произошло, значок дублировать не должен.
export const PR_ICON: Record<Extract<NotifyEvent, { type: 'pr' }>['action'], string> = {
  opened: ICON.info,
  ready_for_review: ICON.info,
  review_requested: ICON.info,
  approved: ICON.ok,
  changes_requested: ICON.red,
  merged: ICON.ok,
  closed: ICON.info
};

export const ISSUE_ICON: Record<Extract<NotifyEvent, { type: 'issue' }>['action'], string> = {
  opened: ICON.info,
  assigned: ICON.info,
  closed: ICON.ok
};

/** Одно место, где решается значок карточки, — и рендер, и звук берут его отсюда. */
export const iconFor = (e: NotifyEvent): string => {
  switch (e.type) {
    case 'deploy':
    case 'ci':
    case 'job':
      return e.status === 'ok' ? ICON.ok : ICON.red;
    case 'session':
      return e.status === 'ok' ? ICON.ok : ICON.alarm;
    case 'incident':
      return ICON.alarm;
    case 'heartbeat_miss':
      return e.recovered ? ICON.ok : ICON.red;
    case 'pr':
      return PR_ICON[e.action];
    case 'issue':
      return ISSUE_ICON[e.action];
    case 'report':
    case 'file':
      return ICON.info;
  }
};

export const severity = (e: NotifyEvent): 'info' | 'error' => {
  // ONE law: the icon decides the sound. There is no second list of "which
  // events are bad" to keep in sync with the icons — keeping two lists is how
  // `🔴 PR: changes_requested` ended up arriving MUTED, the only red card in
  // the package that did not ring, because severity() looked at `status` and a
  // pull request has an `action`.
  const icon = iconFor(e);

  return icon === ICON.red || icon === ICON.alarm ? 'error' : 'info';
};
