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
      via: 'GitHub Actions',
      // The action fills these itself: the run link, and `github.workflow`,
      // which for this file is its `name:` line — "Deploy to Beget".
      workflowUrl: 'https://github.com/sazanwork/playhub/actions/runs/1',
      workflowName: 'Deploy to Beget'
    },
    note: "Чем выкатили — сама вторая строка, и она же ссылка на прогон. Раньше один факт был разрезан натрое: слово «ok», строка «Via» под ним и «Workflow» в самом низу."
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
      note: 'the run was cancelled AFTER the server deploy had already happened — check production by hand',
      via: 'GitHub Actions',
      workflowUrl: 'https://github.com/sazanwork/playhub/actions/runs/1',
      workflowName: 'Deploy to Beget'
    },
    note: "Заголовки Run и Change стоят у каждого непустого блока. У зелёной выкатки блок один — Change, — поэтому она короче, но выглядит так же."
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
    note: "Серая цитата — тело коммита, она появляется, только если автор его написал. Коммит без тела на этой машине больше не создаётся: гард стоит в 25 репозиториях из 30."
  },
  {
    id: 'report', title: 'Дневной отчёт аналитики',
    forum: 'PlayHub · Game Publisher',
    when: 'каждый день, данные за «сегодня минус 3»',
    live: ['live', 'работает'],
    sender: 'scripts/analytics-cron.sh → notify-digest.ts',
    expectTag: '#report #analytics_daily #news',
    event: {
      type: 'report', project: 'game-publisher', key: 'analytics-daily',
      title: 'Analytics for 2026-08-22',
      period: 'compared with 2026-08-21',
      lines: [
        ['Humans', '485 ▲207', 'Server log'],
        ['Game plays', '0 =', 'GA4'],
        ['Users', '0 ▼1', 'GA4'],
        ['Clicks', '0 =', 'Google Search'],
        ['Impressions', '0 =', 'Google Search'],
        ['Visible', '0.0% ▼0.4 — the rest of the visitors gave no consent', 'Coverage']
      ],
      groups: [{ name: 'Top search queries', items: [{ label: 'игры для мальчиков', text: '4 clicks, pos. 12' }] }],
      url: 'https://github.com/sazanwork/game-publisher/blob/master/docs/analytics/2026-08-22.md'
    },
    note: "Стрелка сравнения у каждого числа, а день, против которого они посчитаны, стоит в скобках у названия отчёта — не отдельной строкой среди цифр."
  },
  {
    id: 'report-weekly', title: 'Недельный отчёт аналитики',
    forum: 'PlayHub · Game Publisher',
    when: 'по понедельникам, за прошедшую неделю',
    live: ['live', 'работает'],
    sender: 'scripts/analytics-cron.sh → notify-digest.ts --weekly',
    expectTag: '#report #analytics_weekly #news',
    event: {
      type: 'report', project: 'playhub', key: 'analytics-weekly',
      title: 'Weekly analytics 2026-08-18 – 2026-08-24',
      period: 'compared with 2026-08-11 – 2026-08-17',
      lines: [
        ['Pageviews', '7882 ▲799', 'Server log'],
        ['Game plays', '156 ▼17', 'GA4'],
        ['Users (sum of days)', '345 ▼134', 'GA4'],
        ['Visitors (sum of days)', '331 ▼114', 'Metrica'],
        ['Clicks', '0 ▼1', 'Google Search'],
        ['Impressions', '6 ▼2', 'Google Search'],
        ['Visible', '4.4% ▼2.4 of server pageviews (sum of days)', 'Coverage']],
      groups: [{ name: 'Top search queries', items: [{ label: 'online games ru', text: '0 clicks, pos. 55' }] }]
    },
    note: "То же, что у дневной: неделя, с которой сравниваем, названа в скобках у названия. Ссылка ведёт на недельный файл в docs."
  },
  {
    id: 'report-free', title: 'Утренний отчёт сервера',
    forum: 'PlayHub · Game Publisher',
    when: 'каждое утро с сервера',
    live: ['new', 'после выпуска 1.4.2'],
    sender: 'scripts/daily-report.ts',
    expectTag: '#report #daily_report #news',
    event: {
      type: 'report', project: 'playhub', key: 'daily-report',
      title: 'russkie-igry.ru', url: 'https://russkie-igry.ru', period: '2026-08-25',
      lines: [
        ['Games', 412, 'Catalogue'], ['iOS', '210 +3', 'Catalogue'], ['Android', '202 +5', 'Catalogue'],
        ['Plays', '+37', 'Today'], ['Added this week', '+12', 'Today'], ['Added', '+6', 'Today'],
        ['Through sync', '+6', 'Today'],
      ],
      groups: [
        { name: 'Top 3 games', items: [
          { label: 'Cut the Rope', text: '412' },
          { label: 'Vex 7', text: '208' }
        ] },
        { name: 'Categories', items: [
          { label: 'Action', text: '120' }, { label: 'Puzzle', text: '96' }
        ] },
        { name: 'Recommendations', items: [{ text: 'all good' }] },
        // Здоровье машины — САМЫМ НИЗОМ, ниже всех списков про сайт. Владелец:
        // «какое отношение статистика имеет к здоровью сервера? здоровье
        // вообще, наверное, в самом конце». Поэтому оно не строка с именем
        // группы (те печатаются выше списков), а полноценная группа — так
        // порядок задаёт сам отправитель.
        { name: 'Health', items: [
          { label: 'Server', text: '200 in 118ms' },
          { label: 'Tests', text: 'ok' },
          { label: 'Disk free', text: '34 GB' }
        ] }
      ]
    },
    note: "День, за который отчёт, стоит в скобках у названия — как у остальных отчётов; строки «Period» и «Number» ушли. Здоровье машины — последней группой."
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
    note: "У сессии имени нет, поэтому вторая строка говорит, что с ней случилось. Её 36-значный id с карточки убран — он остался внутри команды внизу, где от него есть толк."
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
      stats: [['Went live', 3]],
      items: [
        { text: 'Cut the Rope', url: 'https://russkie-igry.ru/ru/game/cut-the-rope/', group: 'New today' },
        { text: 'Vex 7', url: 'https://russkie-igry.ru/ru/game/vex-7/', group: 'New today' },
        { text: 'Bloxorz', url: 'https://russkie-igry.ru/ru/game/bloxorz/', group: 'Out of the backlog' },
        { text: 'Fireboy and Watergirl: the judge rejected the description', group: 'Did not come out' },
        { text: 'Nomad: description was not generated', group: 'Did not come out' }
      ],
      url: 'https://russkie-igry.ru'
    },
    note: "Три разные вещи лежали одним списком и различались значком в начале строки. Теперь у каждой свой заголовок, а значки не нужны."
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
      note: 'git push refused: the remote branch holds a commit that is not here'
    }
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
      logs: '/Users/chelsnebes/.claude/logs/vps-backups.log'
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
      logs: '/Users/chelsnebes/Library/Logs/update-all.log'
    },
    note: "Список красных проверок идёт под своим заголовком, а не голым перечнем под ничем."
  },
  {
    id: 'job-disabled', title: 'Сторож минут выключил автоматику',
    forum: 'Mac-config — полная запись · плюс строка в форум каждого проекта',
    when: 'бесплатные минуты GitHub Actions на исходе',
    live: ['live', 'работает — сработал 23 августа'],
    sender: 'actions-minutes-guard.sh',
    expectTag: '#job #actions_minutes_guard #fail',
    event: {
      type: 'job', project: 'mac-config', key: 'actions-minutes-guard',
      job: 'GitHub Actions minutes watchdog', status: 'disabled',
      note: 'Free minutes are nearly gone: 2013 of 2000. Switched these off so failure emails stop. Will switch them back on myself in the new period.',
      items: [
        { text: 'arvent/nightly.yml', url: 'https://github.com/sazanwork/arvent/actions/workflows/nightly.yml' },
        { text: 'one-q/quality.yml', url: 'https://github.com/sazanwork/one-q/actions/workflows/quality.yml' }
      ]
    }
  },
  {
    id: 'ci', title: 'Ночная проверка кода',
    forum: 'Arvent · Game Publisher', when: 'каждую ночь и по кнопке',
    live: ['off', 'выключено — минуты кончились'],
    sender: '.github/workflows/nightly.yml',
    expectTag: '#ci #master #ok',
    event: {
      // A scheduled run has no head commit, so the action's `commit-title`
      // default resolves to nothing and no body is passed. The card carries
      // the hash and the run link, and that is all it ever carries.
      type: 'ci', project: 'arvent', status: 'ok', branch: 'master',
      commit: '9b1fc68', commitUrl: 'https://github.com/sazanwork/arvent/commit/9b1fc68',
      actor: '@chelsnebes', note: 'nightly master check',
      workflowUrl: 'https://github.com/sazanwork/arvent/actions/runs/1', workflowName: 'nightly'
    },
    note: "Заголовка коммита здесь нет и быть не может: ночной прогон запускается по расписанию, а не по коммиту. Имя проверки — сама вторая строка, и она же ссылка на прогон."
  },
  {
    id: 'issue', title: 'Задача на доске',
    forum: 'Arvent · One-Q · PlayHub · Game Publisher',
    when: 'задачу завели, назначили или закрыли на GitHub',
    live: ['live', 'работает — опросник на маке ходит каждые 5 минут'],
    sender: 'home/.claude/scripts/github-cards.py',
    expectTag: '#issue #i322 #news',
    event: {
      type: 'issue', project: 'arvent', action: 'opened', number: 322,
      url: 'https://github.com/sazanwork/arvent/issues/322',
      title: 'Онбординг: мастер не подсказывает вопросы',
      body: 'Первый экран мастера — пустое поле ввода. Человек не понимает,\nчто туда писать, и уходит.\n\nНужно 5–6 готовых вопросов под полем, кликом подставляются в поле.',
      author: 'chelsnebes'
    },
    note: "Номер и заголовок — одна строка, как их пишет сам GitHub, и она же ссылка. Что именно случилось, говорит значок: 🆕 завели, 🙋 назначили, ✅ закрыли."
  },
  {
    id: 'pr', title: 'Pull request',
    forum: 'Arvent · One-Q · PlayHub · Game Publisher',
    when: 'PR открыли, закрыли или влили',
    live: ['live', 'работает'],
    sender: 'home/.claude/scripts/github-cards.py',
    expectTag: '#pr #p118 #news',
    event: {
      type: 'pr', project: 'arvent', action: 'opened', number: 118,
      url: 'https://github.com/sazanwork/arvent/pull/118',
      title: 'Онбординг: заготовки вопросов',
      body: 'Закрывает #322. Шесть вопросов приходят из конфига, а не из кода —\nменять список можно без выкатки.',
      author: 'chelsnebes'
    },
    note: "Та же форма, что у задачи с доски: номер с заголовком одной строкой, тело цитатой."
  },
  {
    id: 'pr-review', title: 'Вердикт ревью',
    forum: 'Arvent · One-Q · PlayHub · Game Publisher',
    when: 'ревьюер одобрил или запросил правки',
    live: ['live', 'работает'],
    sender: 'home/.claude/scripts/github-cards.py — отдельный опрос, событий об этом GitHub не шлёт',
    expectTag: '#pr #p118 #news',
    event: {
      type: 'pr', project: 'arvent', action: 'changes_requested', number: 118,
      url: 'https://github.com/sazanwork/arvent/pull/118',
      title: 'Онбординг: заготовки вопросов',
      reviewer: 'Ilja-Prihach'
    },
    note: "Значок 📝 говорит, что ревьюер просит правки, и звука не даёт: это не поломка. Тела нет — ревьюер писал в GitHub, а не в описании PR."
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
      detail: 'DIVERGED: notify.OPS_BOT_TOKEN — the vault holds one value, the disk another\nSTALE IN ARCHIVE: ssh-keys.tar.gz.age\nBAD   only one recipient: losing the key loses the whole vault\nlog: ~/Library/Logs/vault-selfcheck-fail-20260824-031500.log'
    },
    note: "Вторая строка — сам заголовок аварии, а не слово «open», которое и так говорит значок. Диагноз идёт цитатой целиком: раньше от него оставалась первая строка."
  },
  {
    id: 'job-silent', title: 'Задача перестала отчитываться',
    forum: 'PlayHub · Game Publisher · Arvent',
    when: 'сторож на сервере не увидел отметки в срок',
    live: ['new', 'новая форма — доедет после выкатки сервера PlayHub'],
    sender: 'scripts/heartbeat-check.sh',
    expectTag: '#job #daily_import #fail',
    event: {
      type: 'job', project: 'playhub', key: 'daily-import',
      job: 'Yandex game import', status: 'silent', note: 'no report in time',
      expected: 'at least once every 26h', lastSeen: '23.08 04:12'
    },
    note: "Молчание — состояние задачи, а не отдельный вид события. Раньше оно уходило под своим тегом, и одна задача жила под двумя."
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
      expected: 'at least once every 26h', lastSeen: '25.08 04:10'
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
      job: 'Eval: bot answer quality', status: 'ok',
      stats: [['verdict', '12 of 12 answers passed']],
      path: '/tmp/arvent-eval-24-08.txt',
      filename: 'arvent-eval-24-08.txt'
    },
    note: "Отдельного вида «файл» нет: вложение — свойство любой карточки. Подпись Telegram режет на 1024 знаках, сам файл приезжает целиком."
  }
];
