// Every card in the catalogue, with the arguments its REAL sender passes.
// Nothing here is drawn by hand: render() in build.mjs is the package's own
// renderer, and `expectTag` makes the build assert the tag line it produces —
// the first version of this file dropped the `key` every sender passes, so six
// cards taught the owner a tag the reactor would never see.
export const CARDS = [
  {
    id: 'deploy-actions', title: 'Выкатка через GitHub Actions',
    forum: 'PlayHub · One-Q · Game Publisher',
    when: 'коммит в master, который трогает код сайта',
    live: ['off', 'выключено — минуты кончились'],
    sender: '.github/workflows/deploy.yml → sazanwork/notify',
    expectTag: '#deploy #playhub #ok',
    event: {
      type: 'deploy', project: 'playhub', status: 'ok',
      commit: '9b1fc68', commitUrl: 'https://github.com/sazanwork/playhub/commit/9b1fc68',
      commitTitle: 'feat(catalog): подсказки категорий в поиске',
      commitBody: 'Поиск показывал пустоту, пока не введено три буквы.\nТеперь сразу видно шесть категорий.',
      commitAuthor: 'mikitasazan',
      via: 'GitHub Actions',
      // The action fills these itself: the run link, and `github.workflow`,
      // which for this file is its `name:` line — "Deploy to Beget".
      workflowUrl: 'https://github.com/sazanwork/playhub/actions/runs/1',
      workflowName: 'Deploy to Beget'
    },
    note: "Чем выкатили — сама вторая строка. Строка Commit говорит, что коммит сделал; хеш — это указатель, он стоит внизу в строке Source рядом с прогоном: сначала прогон, потом коммит внутри него."
  },
  {
    id: 'deploy-fail', title: 'Выкатка сорвалась',
    forum: 'PlayHub · One-Q · Game Publisher',
    when: 'прогон упал или его сняли уже после того, как сервер обновился',
    live: ['off', 'выключено — минуты кончились'],
    sender: '.github/workflows/deploy.yml → sazanwork/notify',
    expectTag: '#deploy #playhub #fail',
    event: {
      type: 'deploy', project: 'playhub', status: 'fail',
      commit: '9b1fc68', commitUrl: 'https://github.com/sazanwork/playhub/commit/9b1fc68',
      commitTitle: 'feat(catalog): подсказки категорий в поиске',
      commitBody: 'Поиск показывал пустоту, пока не введено три буквы.',
      commitAuthor: 'mikitasazan',
      note: 'the run was cancelled AFTER the server deploy had already happened — check production by hand',
      via: 'GitHub Actions',
      workflowUrl: 'https://github.com/sazanwork/playhub/actions/runs/1',
      workflowName: 'Deploy to Beget'
    },
    note: "Причина срыва стоит вплотную к имени прогона — там же, где она стоит у любой упавшей задачи. Заголовок остаётся только у коммита: это уже другой предмет."
  },
  {
    id: 'deploy-manual', title: 'Выкатка руками с Mac',
    forum: 'PlayHub · Game Publisher',
    when: 'запуск scripts/deploy.sh на маке',
    live: ['live', 'работает'],
    sender: 'scripts/deploy.sh → node_modules/@mikitasazan/notify',
    expectTag: '#deploy #game_publisher #ok',
    event: {
      type: 'deploy', project: 'game-publisher', status: 'ok',
      commit: '3f1a882', commitUrl: 'https://github.com/sazanwork/game-publisher/commit/3f1a882',
      commitTitle: 'fix(import): пропускать игры без обложки',
      commitBody: 'Игра без обложки ломала вёрстку каталога на мобильном.',
      via: 'manual, from the Mac'
    },
    note: "Серая цитата — тело коммита, она появляется, только если автор его написал. Коммит без тела на этой машине больше не создаётся: гард стоит в 25 репозиториях из 30. Прогона у ручной выкатки нет, поэтому источник здесь — сам коммит, и строка Source ведёт на него."
  },
  {
    id: 'report', title: 'Дневной отчёт аналитики',
    forum: 'PlayHub · Game Publisher',
    when: 'каждый день, данные за «сегодня минус 3»',
    live: ['live', 'работает'],
    sender: 'scripts/analytics-cron.sh → notify-digest.ts',
    expectTag: '#report #analytics_daily #info',
    // Real numbers, from playhub's own analytics file for 2026-08-23 against
    // 2026-08-22. Invented ones had grown their own labels (`Humans`, which no
    // sender prints) and their own arithmetic.
    event: {
      type: 'report', project: 'playhub', key: 'analytics-daily',
      title: 'Analytics, daily — russkie-igry.ru',
      aside: '2026-08-23 / 2026-08-22',
      lines: [
        ['Pages', '1687 / 1438 ▼249', 'Server log'],
        ['Game plays', '26 / 26 =', 'GA4'],
        ['People', '46 / 51 ▲5', 'Metrica'],
        ['People', '38 / 51 ▲13', 'GA4'],
        ['Clicks', '0 / 0 =', 'Google Search'],
        ['Impressions', '1 / 0 ▼1', 'Google Search'],
        ['Visible', '2.3% / 3.5% ▲1.3 (of the pages the server counted — the rest are blocked or have no JS)', 'Coverage']
      ],
      url: 'https://github.com/sazanwork/playhub/blob/master/docs/analytics/2026-08-23.md'
    },
    note: "Имя отчёта не носит даты — день и день сравнения стоят в скобках, как у всех остальных. Стрелка есть у каждого числа: сравнивать было с чем."
  },
  {
    id: 'report-weekly', title: 'Недельный отчёт аналитики',
    forum: 'PlayHub · Game Publisher',
    when: 'по понедельникам, за прошедшую неделю',
    live: ['live', 'работает'],
    sender: 'scripts/analytics-cron.sh → notify-digest.ts --weekly',
    expectTag: '#report #analytics_weekly #info',
    // The real weekly card playhub sent for 2026-08-17 – 2026-08-23. The week
    // before it was not read, so there is nothing to compare against and not a
    // single arrow is drawn — which is the rule, not a gap in the example.
    event: {
      type: 'report', project: 'playhub', key: 'analytics-weekly',
      title: 'Analytics, weekly — russkie-igry.ru',
      aside: '2026-08-17 – 2026-08-23',
      lines: [
        ['Pages', 7639, 'Server log'],
        ['Game plays', 164, 'GA4'],
        ['People (days added up)', 342, 'GA4'],
        ['People (days added up)', 317, 'Metrica'],
        ['Clicks', 0, 'Google Search'],
        ['Impressions', 7, 'Google Search'],
        ['Visible', '4.5% (of the pages the server counted)', 'Coverage']],
      url: 'https://github.com/sazanwork/playhub/tree/master/docs/analytics',
      groups: [{ name: 'Top search queries', items: [
        { text: '"online games ru"', facts: [['Clicks', 0], ['Position', 55]] },
        { text: '"online games russian"', facts: [['Clicks', 0], ['Position', 59]] }
      ] }]
    },
    note: "Сравнивать было не с чем — предыдущую неделю не читали, и поэтому ни одной стрелки. Это правило, а не пробел в примере."
  },
  {
    id: 'report-free', title: 'Утренний отчёт сервера',
    // The card's own arithmetic, checked at build time.
    sums: [['Games', ['iOS', 'Android']]],
    forum: 'PlayHub · Game Publisher',
    when: 'каждое утро с сервера',
    live: ['new', 'после выпуска 1.4.2'],
    sender: 'scripts/daily-report.ts',
    expectTag: '#report #daily_report #info',
    event: {
      type: 'report', project: 'playhub', key: 'daily-report',
      title: 'Site digest, daily — russkie-igry.ru', url: 'https://russkie-igry.ru', aside: '2026-08-25',
      lines: [
        ['Games', '404 / 412 ▲8', 'Catalogue'], ['iOS', '207 / 210 ▲3', 'Catalogue'], ['Android', '197 / 202 ▲5', 'Catalogue'],
        ['Added this week', 12, 'Catalogue'],
        ['Plays', 37, 'Today'], ['Added', 6, 'Today'], ['Through sync', 6, 'Today'],
      ],
      groups: [
        { name: 'Top 3 games', items: [
          { label: 'Cut the Rope', text: '412' },
          { label: 'Vex 7', text: '208' }
        ] },
        { name: 'Categories', items: [
          { label: 'Action', text: '120' }, { label: 'Puzzle', text: '96' }
        ] },
        // Здоровье машины — САМЫМ НИЗОМ, ниже всех списков про сайт. Владелец:
        // «какое отношение статистика имеет к здоровью сервера? здоровье
        // вообще, наверное, в самом конце». Поэтому оно не строка с именем
        // группы (те печатаются выше списков), а полноценная группа — так
        // порядок задаёт сам отправитель.
        { name: 'Health', items: [
          { label: 'Server', text: '200 in 118ms' },
          { label: 'Tests', text: 'ok' },
          { label: 'Disk free', text: '34 GB' }
        ] },
        // Совет — последним, под всем, из чего он сделан, и только когда совет
        // есть. Группа стояла ВЫШЕ здоровья машины и печатала «all good», когда
        // сказать было нечего: это состояние, а не рекомендация.
        { name: 'Recommendations', items: [
          { text: '[UX] 12 games with no plays — check titles and thumbnails' }
        ] }
      ]
    },
    note: "Итог не стоит на месте, когда его части сдвинулись: 210 ▲3 плюс 202 ▲5 — это 412 ▲8. Рекомендации внизу, под всем, из чего они сделаны, и их нет, когда советовать нечего."
  },
  {
    id: 'session', title: 'Сессия жжёт лимит',
    forum: 'Mac-config',
    when: 'сессия переписывает кэш вместо чтения — сторож её останавливает',
    live: ['new', 'новый вид карточки'],
    sender: 'context-runaway-guard.sh → context-runaway-notify.sh',
    expectTag: '#session #context_runaway #fail',
    event: {
      type: 'session', project: 'mac-config', key: 'context-runaway',
      action: 'burning the limit', status: 'fail',
      id: '8f03d18c-b7d6-438c-bb40-6756c3e1e835',
      workdir: 'mac-config',
      reason: 'context 871596 against a compact line of 500000, cache rewrites: 5 of the last 30 requests',
      opened: 'Пройди на Хекслете (ru.hexlet.io) по очереди эти темы из «Мои темы» (в этом порядке): 1. Python: Разработка на Django, 2. Основы вёрстки',
      command: 'rm /var/folders/f1/vkkb__f93dv44kmfstl9pgf40000gn/T/claude-ctxguard/8f03d18c.latch',
      commandNote: 'let this session keep working — it stays stopped until you do'
    },
    note: "У сессии имени нет, поэтому вторая строка говорит, что с ней случилось. Твоя строка запуска идёт под заголовком блока, как список у любой другой карточки; 36-значный id остался только внутри команды внизу."
  },
  {
    id: 'job-import', title: 'Импорт игр — дневной итог',
    forum: 'PlayHub', when: 'ежедневно по расписанию на сервере',
    live: ['live', 'работает'],
    sender: 'scripts/daily-import-cron.sh',
    expectTag: '#job #daily_import #ok',
    event: {
      type: 'job', project: 'playhub', key: 'daily-import',
      job: 'Yandex game import', status: 'ok',
      items: [
        { text: 'Cut the Rope', url: 'https://russkie-igry.ru/ru/game/cut-the-rope/', group: 'New today' },
        { text: 'Vex 7', url: 'https://russkie-igry.ru/ru/game/vex-7/', group: 'New today' },
        { text: 'Bloxorz', url: 'https://russkie-igry.ru/ru/game/bloxorz/', group: 'Out of the backlog' },
        { text: 'Fireboy and Watergirl: the judge rejected the description', group: 'Did not come out' },
        { text: 'Nomad: description was not generated', group: 'Did not come out' }
      ],
      url: 'https://russkie-igry.ru'
    },
    note: "Три разные вещи лежали одним списком и различались значком в начале строки — теперь у каждой свой заголовок. Итоговое число убрано: оно было длиной двух списков, которые и так видно."
  },
  {
    id: 'job-fail', title: 'Задача конфига упала',
    forum: 'Mac-config',
    when: 'задача по расписанию на маке завершилась с ошибкой',
    live: ['live', 'работает'],
    sender: 'notify-fail.sh — всегда и только форум Mac-config',
    expectTag: '#job #config_sync #fail',
    event: {
      type: 'job', project: 'mac-config', key: 'config-sync',
      job: 'Config sync', status: 'fail',
      note: 'git push refused: the remote branch holds a commit that is not here',
      logs: '/Users/chelsnebes/Library/Logs/config-sync.log',
      check: 'config jobs --log config-sync'
    },
    note: "Красная карточка задачи всегда говорит, куда смотреть, и говорит командой: Check показывает лог этой задачи одним тапом. Путь к файлу идёт вдобавок — по пути не тапнешь, а команду копируешь и запускаешь."
  },
  {
    id: 'job-backups', title: 'Бэкапы сервера сломались',
    forum: 'Mac-config',
    when: 'ночная выкачка копий с сервера нашла битую или несвежую',
    live: ['off', 'красная прямо сейчас'],
    sender: 'home/bin/pull-vps-backups.sh',
    expectTag: '#job #vps_backups #fail',
    event: {
      type: 'job', project: 'mac-config', key: 'vps-backups',
      job: 'Server backups', status: 'fail',
      note: 're-downloading from the server did not help, there is nothing to roll back to',
      stats: [['Fresh', 10, 'Copies on the Mac'], ['Broken', 1, 'Copies on the Mac']],
      logs: '/Users/chelsnebes/.claude/logs/vps-backups.log',
      check: 'config jobs --log vps-backups'
    },
    note: "Было одной строкой: «fresh copies: 10, broken: 1 — re-downloading…». Счётчики стали своими строками, путь к логу — моноширинным."
  },
  {
    id: 'job-checks', title: 'Проверки конфига покраснели',
    forum: 'Mac-config',
    when: 'ежедневный прогон конфига в 13:00 нашёл красное',
    live: ['live', 'работает'],
    sender: 'home/bin/update-all',
    expectTag: '#job #config_tests #fail',
    event: {
      type: 'job', project: 'mac-config', key: 'config-tests',
      job: 'Config checks', status: 'fail',
      note: '2 checks are red',
      items: [{ text: 'test-update-all', group: 'Red checks' },
        { text: 'check-notify-flags', group: 'Red checks' }],
      logs: '/Users/chelsnebes/Library/Logs/update-all.log',
      check: 'config jobs --log config-tests'
    },
    note: "Список красных проверок идёт под своим заголовком, а не голым перечнем под ничем."
  },
  {
    id: 'job-disabled', title: 'Сторож минут выключил автоматику',
    forum: 'Mac-config — полная запись · плюс строка в форум каждого проекта',
    when: 'бесплатные минуты GitHub Actions на исходе',
    live: ['live', 'работает — сработал 23 августа'],
    sender: 'actions-minutes-guard.sh',
    expectTag: '#job #actions_minutes_guard #off',
    event: {
      type: 'job', project: 'mac-config', key: 'actions-minutes-guard',
      job: 'GitHub Actions minutes watchdog', status: 'disabled',
      note: 'Free minutes are nearly gone: 2013 of 2000. Switched these off so failure emails stop. Will switch them back on myself in the new period.',
      url: 'https://github.com/organizations/sazanwork/settings/billing',
      items: [
        { text: 'arvent/nightly.yml', url: 'https://github.com/sazanwork/arvent/actions/workflows/nightly.yml' },
        { text: 'one-q/quality.yml', url: 'https://github.com/sazanwork/one-q/actions/workflows/quality.yml' }
      ]
    },
    note: "Тег #off, а не #fail: сторож выключил прогоны нарочно, это не поломка. Слово «выключено» говорит значок 🚫, поэтому строки State на карточке нет. Страница расхода минут — в строке Source внизу."
  },
  {
    id: 'ci', title: 'Ночная проверка кода',
    forum: 'Arvent · Game Publisher', when: 'каждую ночь и по кнопке',
    live: ['off', 'выключено — минуты кончились'],
    sender: '.github/workflows/nightly.yml',
    expectTag: '#ci #master #ok',
    event: {
      // A scheduled run has no head commit, so the action's `commit-title`
      // and `commit-author` defaults both resolve to nothing. The card
      // carries the hash and the run link, and that is all it ever carries.
      type: 'ci', project: 'arvent', status: 'ok', branch: 'master',
      commit: '9b1fc68', commitUrl: 'https://github.com/sazanwork/arvent/commit/9b1fc68',
      actor: '@chelsnebes', note: 'nightly master check',
      workflowUrl: 'https://github.com/sazanwork/arvent/actions/runs/1', workflowName: 'nightly'
    },
    note: "Коммита здесь нет: ночной прогон идёт по расписанию, а не по пушу. Actor рядом с ним — НЕ автор коммита, а дежурный, который чинит красный прогон. Ниже — обычный CI по пушу, там оба поля на месте и это разные люди."
  },
  {
    id: 'ci-push', title: 'CI, упавший на пуше',
    forum: 'Game Publisher · One-Q', when: 'коммит в master, гейт (lint/typecheck/тесты) упал',
    live: ['live', 'работает'],
    sender: '.github/workflows/quality.yml → sazanwork/notify',
    expectTag: '#ci #master #fail',
    event: {
      // No --commit/--commit-title/--commit-author on this call at all — the
      // action fills all three from github.event.head_commit, which push
      // events always carry. Nothing to change in the workflow to get this.
      type: 'ci', project: 'game-publisher', status: 'fail', branch: 'master',
      commit: '3f1a882', commitUrl: 'https://github.com/sazanwork/game-publisher/commit/3f1a882',
      commitTitle: 'fix(import): пропускать игры без обложки',
      commitAuthor: 'mikitasazan',
      note: 'type check failed (astro check)',
      workflowUrl: 'https://github.com/sazanwork/game-publisher/actions/runs/2', workflowName: 'quality'
    },
    note: "Коммит и его автор взялись сами — quality.yml их не передаёт, экшен берёт из события пуша. Reason теперь тоже есть: у каждого из пяти шагов гейта свой id, и последний шаг перед уведомлением называет, чей outcome — failure."
  },
  {
    id: 'issue', title: 'Задача на доске',
    forum: 'Arvent · One-Q · PlayHub · Game Publisher',
    when: 'задачу завели, назначили или закрыли на GitHub',
    live: ['live', 'работает — опросник на маке ходит каждые 5 минут'],
    sender: 'home/.claude/scripts/github-cards.py',
    expectTag: '#issue #i322 #info',
    event: {
      type: 'issue', project: 'arvent', action: 'opened', number: 322,
      url: 'https://github.com/sazanwork/arvent/issues/322',
      title: 'Онбординг: мастер не подсказывает вопросы',
      body: 'Первый экран мастера — пустое поле ввода. Человек не понимает,\nчто туда писать, и уходит.\n\nНужно 5–6 готовых вопросов под полем, кликом подставляются в поле.',
      author: 'mikitasazan'
    },
    note: "Номер и заголовок — одна строка, как их пишет сам GitHub. Что именно случилось, говорит значок: 🆕 завели, 🙋 назначили, ✅ закрыли. Тело задачи идёт сразу под заголовком, ничего не стоит между ними — люди спустились ниже, отдельным блоком, ссылка на задачу — в Source."
  },
  {
    id: 'issue-taken', title: 'Задачу взяли',
    forum: 'Arvent · One-Q · PlayHub · Game Publisher',
    when: 'у задачи появился исполнитель',
    live: ['live', 'работает'],
    sender: 'home/.claude/scripts/github-cards.py',
    expectTag: '#issue #i312 #info',
    event: {
      type: 'issue', project: 'arvent', action: 'assigned', number: 312,
      url: 'https://github.com/sazanwork/arvent/issues/312',
      title: 'Запись клиента в вебе: страница, не зависящая от Telegram',
      body: 'Длинное описание задачи, которое было новостью один раз — когда задачу завели.',
      author: 'mikitasazan', assignee: 'Ilja-Prihach'
    },
    note: "Тело задачи приходит при ЛЮБОМ действии, а не только когда её завели: контекст должен быть на карточке, а не за ссылкой. Длинное тело Telegram сворачивает — тап разворачивает. Новость этой карточки, кто взял, стоит отдельной строкой и текстом не завалена."
  },
  {
    id: 'pr', title: 'Pull request',
    forum: 'Arvent · One-Q · PlayHub · Game Publisher',
    when: 'PR открыли, закрыли или влили',
    live: ['live', 'работает'],
    sender: 'home/.claude/scripts/github-cards.py',
    expectTag: '#pr #p118 #info',
    event: {
      type: 'pr', project: 'arvent', action: 'opened', number: 118,
      url: 'https://github.com/sazanwork/arvent/pull/118',
      title: 'Онбординг: заготовки вопросов',
      body: 'Закрывает #322. Шесть вопросов приходят из конфига, а не из кода —\nменять список можно без выкатки.',
      author: 'mikitasazan'
    },
    note: "Та же форма, что у задачи с доски: номер с заголовком одной строкой, тело цитатой сразу под ним, автор — ниже, отдельно."
  },
  {
    id: 'pr-review', title: 'Вердикт ревью',
    forum: 'Arvent · One-Q · PlayHub · Game Publisher',
    when: 'ревьюер одобрил или запросил правки',
    live: ['live', 'работает'],
    sender: 'home/.claude/scripts/github-cards.py — отдельный опрос, событий об этом GitHub не шлёт',
    expectTag: '#pr #p118 #info',
    event: {
      type: 'pr', project: 'arvent', action: 'changes_requested', number: 118,
      url: 'https://github.com/sazanwork/arvent/pull/118',
      title: 'Онбординг: заготовки вопросов',
      body: 'Переименуй эту переменную, она перекрывает внешнюю с тем же именем.',
      reviewer: 'Ilja-Prihach'
    },
    note: "Значок 📝 говорит, что просят правки, звука не даёт — не поломка. Цитата — комментарий самого ревьюера, не описание PR ещё раз: раньше сюда по ошибке подставлялось описание, а рендерер его и так глушил — карточка молчала. Источник поправили, и вердикт с правками теперь говорит, что именно исправить."
  },
  {
    id: 'incident', title: 'Авария',
    forum: 'Vault', when: 'еженедельная самопроверка сейфа нашла расхождение',
    live: ['live', 'работает'],
    sender: 'vault.sh',
    expectTag: '#incident #vault_selfcheck #fail',
    event: {
      type: 'incident', project: 'vault', key: 'vault-selfcheck',
      title: 'The vault needs repair',
      items: [
        { text: 'DIVERGED: notify.OPS_BOT_TOKEN — the vault holds one value, the disk another', group: 'Findings' },
        { text: 'STALE IN ARCHIVE: ssh-keys.tar.gz.age', group: 'Findings' },
        { text: 'BAD only one recipient: losing the key loses the whole vault', group: 'Findings' }
      ],
      logs: '~/Library/Logs/vault-selfcheck-fail-20260824-031500.log',
      check: 'config jobs --log vault-selfcheck'
    },
    note: "Три находки были одним --detail, склеенным переводом строки — маркер (BAD/STALE/DIVERGED) в начале каждой строки делал работу заголовка внутри цитаты без единого лейбла. Теперь это именованный список, заголовок печатает пакет, а не текст сам себя подписывает. Путь к логу — свой моноширинный хвост."
  },
  {
    id: 'job-silent', title: 'Задача перестала отчитываться',
    forum: 'PlayHub · Game Publisher · Arvent',
    when: 'сторож на сервере не увидел отметки в срок',
    live: ['new', 'новая форма — доедет после выкатки сервера PlayHub'],
    sender: 'scripts/heartbeat-check.sh',
    expectTag: '#job #daily_import #unknown',
    event: {
      type: 'job', project: 'playhub', key: 'daily-import',
      job: 'Yandex game import', status: 'silent', note: 'no report in time',
      expected: 'at least once every 26h', lastSeen: '23.08 04:12',
      url: 'https://russkie-igry.ru'
    },
    note: "Тег #unknown, а не #fail — молчание не значит поломку. Куда смотреть есть и здесь: у задачи с сервера — Source со ссылкой, у задачи с мака ссылки нет, поэтому там стоит Check с командой."
  },
  {
    id: 'job-silent-ok', title: 'Задача снова отчитывается',
    forum: 'PlayHub · Game Publisher · Arvent',
    when: 'после молчания задача снова оставила отметку',
    live: ['new', 'новая форма — доедет после выкатки сервера PlayHub'],
    sender: 'scripts/heartbeat-check.sh — или просто удачный прогон самой задачи',
    expectTag: '#job #daily_import #ok',
    event: {
      type: 'job', project: 'playhub', key: 'daily-import',
      job: 'Yandex game import', status: 'ok', note: 'reporting again',
      expected: 'at least once every 26h', lastSeen: '25.08 04:10',
      url: 'https://russkie-igry.ru'
    },
    note: "Тег тот же, что у красной карточки выше, — так выглядит пара «сломалось → починилось»."
  },
  {
    id: 'file', title: 'Карточка с вложением',
    forum: 'Arvent', when: 'после вечернего прогона качества ответов бота',
    live: ['new', 'после выпуска 1.4.2'],
    sender: 'arvent-eval-report.sh',
    expectTag: '#job #arvent_eval #ok',
    event: {
      type: 'job', project: 'arvent', key: 'arvent-eval',
      job: 'Bot answer quality', status: 'ok',
      stats: [['verdict', '12 of 12 answers passed']],
      path: '/tmp/arvent-eval-24-08.txt',
      filename: 'arvent-eval-24-08.txt'
    },
    note: "Отдельного вида «файл» нет: вложение — свойство любой карточки. Подпись Telegram режет на 1024 знаках, сам файл приезжает целиком."
  }
];
