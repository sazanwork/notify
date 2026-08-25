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
    expectTag: '#deploy #playhub',
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
    }
  },
  {
    id: 'deploy-manual', title: 'Выкатка руками с Mac',
    forum: 'PlayHub · Game Publisher',
    when: 'запуск scripts/deploy.sh на маке',
    live: ['live', 'работает'],
    sender: 'scripts/deploy.sh → node_modules/@mikitasazan/notify',
    expectTag: '#deploy #game_publisher',
    event: {
      type: 'deploy', project: 'game-publisher', status: 'ok',
      commit: '3f1a882', commitUrl: 'https://github.com/sazanwork/game-publisher/commit/3f1a882',
      commitTitle: 'fix(import): пропускать игры без обложки',
      commitBody: 'Игра без обложки ломала вёрстку каталога на мобильном.',
      via: 'manual, from the Mac'
    },
    note: 'Серая цитата — это тело коммита, и она появляется, только если автор его написал. Твой скриншот был короче именно поэтому: у того коммита тела не было, и цитировать было нечего. С 25.08.2026 такие коммиты в 25 репозиториях машины просто не создаются — гард не даёт закоммитить без тела. Пять пропущены намеренно: в четырёх файл хука лежит в самом git и репозиторий не только его, в пятом хуки вынесены наружу. Остаться карточка без цитаты может от коммита, сделанного мимо этой машины: слияние кнопкой на GitHub, чужой коммит, коммит старше гарда.'
  },
  {
    id: 'report', title: 'Дневной отчёт аналитики',
    forum: 'PlayHub · Game Publisher',
    when: 'каждый день, данные за «сегодня минус 3»',
    live: ['live', 'работает'],
    sender: 'scripts/analytics-cron.sh → notify-digest.ts',
    expectTag: '#report #analytics_daily',
    event: {
      type: 'report', project: 'game-publisher', key: 'analytics-daily',
      title: 'Analytics for 2026-08-22', period: 'compared with 2026-08-21',
      lines: [
        ['Humans in the server log', '262 ▲23'],
        ['Game plays', 0],
        ['GA4 users', 1],
        ['Google clicks / impressions', '0 / 0'],
        ['Visible', '0.4% of visitors — the rest gave no consent']
      ],
      items: [{ label: 'игры для мальчиков', text: '4 clicks, pos. 12' }],
      url: 'https://github.com/sazanwork/game-publisher/blob/master/docs/analytics/2026-08-22.md'
    },
    note: 'Поисковый запрос внизу стоял через тире — «игры для мальчиков — 4 clicks». Тире делало работу двоеточия, а третьего знака препинания в формате быть не должно: запрос теперь ярлык, как и всё остальное. Значок 💡 у ярлыка ушёл по той же причине — ярлык это слово. Ссылка переехала с отдельной строки «Details: open» на само название отчёта. И тег: раньше отчёт не передавал ключ, поэтому тег собирался из заголовка с датой и был новым КАЖДЫЙ день — пара «сломалось → починилось» по нему не находилась никогда. Теперь ключ постоянный.'
  },
  {
    id: 'report-weekly', title: 'Недельный отчёт аналитики',
    forum: 'PlayHub · Game Publisher',
    when: 'по понедельникам, за прошедшую неделю',
    live: ['live', 'работает'],
    sender: 'scripts/analytics-cron.sh → notify-digest.ts --weekly',
    expectTag: '#report #analytics_weekly',
    event: {
      type: 'report', project: 'playhub', key: 'analytics-weekly',
      title: 'Weekly analytics for 2026-08-24', period: 'compared with the week before',
      lines: [['Pages served', '3120 ▲210'], ['GA4 users', 34], ['Google clicks / impressions', '18 / 940']],
      url: 'https://github.com/sazanwork/playhub/blob/master/docs/analytics/weekly/2026-W34.md'
    }
  },
  {
    id: 'report-free', title: 'Дневной отчёт сервера — свободный текст',
    forum: 'PlayHub · Game Publisher',
    when: 'каждое утро с сервера',
    live: ['live', 'работает'],
    sender: 'scripts/daily-report.ts → sendReport()',
    raw: [
      '📊 <b>russkie-igry.ru — Report #128</b>',
      '📅 25.08.2026',
      '',
      '🎮 412 games (🍎 210 iOS · 🤖 202 Android) | 📈 +37 plays',
      '📥 Today: +6 (sync: +6 / −0 / ↩0)',
      '',
      '✅ health 200 · ✅ tests ok'
    ].join('\n'),
    note: 'Единственный вид сообщения БЕЗ строки тегов. Пакет здесь стандартизирует только доставку — повторы, таймауты, номер вкладки, — а формат остаётся собственным: плотная строка, которую типизированное событие не выражает. Поэтому и правило «первая строка — два тега» к нему не относится.'
  },
  {
    id: 'session', title: 'Сессия жжёт лимит',
    forum: 'Mac-config',
    when: 'сессия переписывает кэш вместо чтения — сторож её останавливает',
    live: ['new', 'новый вид карточки'],
    sender: 'context-runaway-guard.sh → context-runaway-notify.sh',
    expectTag: '#session #context_runaway',
    event: {
      type: 'session', project: 'mac-config', key: 'context-runaway',
      action: 'burning the limit', status: 'fail',
      id: '8f03d18c-b7d6-438c-bb40-6756c3e1e835',
      workdir: 'mac-config',
      reason: 'context 871596 against a compact line of 500000, cache rewrites: 5 of the last 30 requests',
      opened: 'Пройди на Хекслете (ru.hexlet.io) по очереди эти темы из «Мои темы» (в этом порядке): 1. Python: Разработка на Django, 2. Основы вёрстки',
      command: 'rm /var/folders/f1/vkkb__f93dv44kmfstl9pgf40000gn/T/claude-ctxguard/8f03d18c.latch'
    },
    note: 'Раньше это уходило под тегом #job — а сессия не задача по расписанию. Теперь свой тип, а имя сессии — та строка, которой ты её открыл, целиком в цитате: полем оно обрезалось.'
  },
  {
    id: 'job-import', title: 'Импорт игр — дневной итог',
    forum: 'PlayHub', when: 'ежедневно по расписанию на сервере',
    live: ['live', 'работает'],
    sender: 'scripts/daily-import-cron.sh',
    expectTag: '#job #daily_import',
    event: {
      type: 'job', project: 'playhub', key: 'daily-import',
      job: 'Yandex game import', status: 'ok',
      stats: [['Published', '9 (5 new, 4 from backlog)'], ['Stuck', 2]],
      items: [
        { text: '🆕 Cut the Rope', url: 'https://russkie-igry.ru/ru/game/cut-the-rope/' },
        { text: '🆕 Vex 7', url: 'https://russkie-igry.ru/ru/game/vex-7/' },
        { text: '🔁 Bloxorz', url: 'https://russkie-igry.ru/ru/game/bloxorz/' },
        { text: '⚠ Fireboy and Watergirl: the judge rejected the description' }
      ],
      url: 'https://russkie-igry.ru'
    },
    note: 'Имя задачи стало ссылкой. Отдельной строки «Workflow: open» больше нет — она вела туда же, а называлась глаголом. Этот отправитель передаёт адрес сайта, так что ссылка ведёт на сайт, а не на прогон.'
  },
  {
    id: 'job-fail', title: 'Задача конфига упала',
    forum: 'Mac-config',
    when: 'задача по расписанию на маке завершилась с ошибкой',
    live: ['live', 'работает'],
    sender: 'notify-fail.sh — всегда и только форум Mac-config',
    expectTag: '#job #config_sync',
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
    expectTag: '#job #vps_backups',
    event: {
      type: 'job', project: 'mac-config', key: 'vps-backups',
      job: 'Server backups', status: 'fail',
      note: 're-downloading from the server did not help, there is nothing to roll back to',
      stats: [['Fresh copies', 10], ['Broken', 1]],
      logs: '/Users/chelsnebes/.claude/logs/vps-backups.log'
    },
    note: 'Было одной строкой: «fresh copies: 10, broken: 1 — re-downloading…». Три факта и двоеточия внутри одного ярлыка «Reason». Счётчики стали своими строками, путь к логу — моноширинным, а под «Reason» осталось предложение.'
  },
  {
    id: 'job-checks', title: 'Проверки конфига покраснели',
    forum: 'Mac-config',
    when: 'ежедневный прогон конфига в 13:00 нашёл красное',
    live: ['live', 'работает'],
    sender: 'home/bin/update-all',
    expectTag: '#job #config_tests',
    event: {
      type: 'job', project: 'mac-config', key: 'config-tests',
      job: 'Config checks', status: 'fail',
      note: '2 checks are red',
      items: [{ text: 'test-update-all' }, { text: 'check-notify-flags' }],
      logs: '/Users/chelsnebes/Library/Logs/update-all.log'
    },
    note: 'Было хвостом: «red: a b c — which one exactly is in the log: /Users/…». Красные проверки стали списком, путь к логу — своей строкой.'
  },
  {
    id: 'job-disabled', title: 'Сторож минут выключил автоматику',
    forum: 'Mac-config — полная запись · плюс строка в форум каждого проекта',
    when: 'бесплатные минуты GitHub Actions на исходе',
    live: ['live', 'работает — сработал 23 августа'],
    sender: 'actions-minutes-guard.sh',
    expectTag: '#job #actions_minutes_guard',
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
    expectTag: '#ci #master',
    event: {
      // A scheduled run has no head commit, so the action's `commit-title`
      // default resolves to nothing and no body is passed. The card carries
      // the hash and the run link, and that is all it ever carries.
      type: 'ci', project: 'arvent', status: 'ok', branch: 'master',
      commit: '9b1fc68', commitUrl: 'https://github.com/sazanwork/arvent/commit/9b1fc68',
      actor: '@chelsnebes', note: 'nightly master check, full run: success',
      workflowUrl: 'https://github.com/sazanwork/arvent/actions/runs/1', workflowName: 'nightly'
    },
    note: 'Заголовка коммита и цитаты здесь НЕТ и быть не может: ночной прогон запускается по расписанию, а не по коммиту, и GitHub не даёт его заголовок. Раньше в поле «Commit» лежали две строки человеческого текста вместо хэша — текст переехал в «Reason».'
  },
  {
    id: 'issue', title: 'Задача на доске',
    forum: 'Arvent · One-Q · PlayHub · Game Publisher',
    when: 'задачу завели, назначили или закрыли на GitHub',
    live: ['live', 'работает — опросник на маке ходит каждые 5 минут'],
    sender: 'home/.claude/scripts/github-cards.py',
    expectTag: '#issue #i322',
    event: {
      type: 'issue', project: 'arvent', action: 'opened', number: 322,
      url: 'https://github.com/sazanwork/arvent/issues/322',
      title: 'Онбординг: мастер не подсказывает вопросы',
      body: 'Первый экран мастера — пустое поле ввода. Человек не понимает,\nчто туда писать, и уходит.\n\nНужно 5–6 готовых вопросов под полем, кликом подставляются в поле.',
      author: 'chelsnebes'
    },
    note: 'Три события и только три: завели, назначили, закрыли. Переоткрыли или повесили ярлык — молчание, намеренно: одна новость — одно сообщение. Закрытая задача приходит зелёной.'
  },
  {
    id: 'pr', title: 'Pull request',
    forum: 'Arvent · One-Q · PlayHub · Game Publisher',
    when: 'PR открыли, закрыли или влили',
    live: ['live', 'работает'],
    sender: 'home/.claude/scripts/github-cards.py',
    expectTag: '#pr #p118',
    event: {
      type: 'pr', project: 'arvent', action: 'opened', number: 118,
      url: 'https://github.com/sazanwork/arvent/pull/118',
      title: 'Онбординг: заготовки вопросов',
      body: 'Закрывает #322. Шесть вопросов приходят из конфига, а не из кода —\nменять список можно без выкатки.',
      author: 'chelsnebes'
    },
    note: '«Попросили ревью» и «переоткрыли» сюда не приходят намеренно: PR уже объявлен открытым, второе сообщение о том же — шум.'
  },
  {
    id: 'pr-review', title: 'Вердикт ревью',
    forum: 'Arvent · One-Q · PlayHub · Game Publisher',
    when: 'ревьюер одобрил или запросил правки',
    live: ['live', 'работает'],
    sender: 'home/.claude/scripts/github-cards.py — отдельный опрос, событий об этом GitHub не шлёт',
    expectTag: '#pr #p118',
    event: {
      type: 'pr', project: 'arvent', action: 'changes_requested', number: 118,
      url: 'https://github.com/sazanwork/arvent/pull/118',
      title: 'Онбординг: заготовки вопросов',
      reviewer: 'Ilja-Prihach'
    },
    note: 'Единственный вид карточки PR, которая приходит КРАСНОЙ. Одобрение того же PR приходит зелёным под тем же тегом — это и есть пара «сломалось → починилось».'
  },
  {
    id: 'incident', title: 'Авария',
    forum: 'Vault', when: 'еженедельная самопроверка сейфа нашла расхождение',
    live: ['live', 'работает'],
    sender: 'vault.sh',
    expectTag: '#incident #vault_selfcheck',
    event: {
      type: 'incident', project: 'vault', key: 'vault-selfcheck',
      title: 'The vault needs repair',
      detail: 'DIVERGED: notify.OPS_BOT_TOKEN — the vault holds one value, the disk another\nSTALE IN ARCHIVE: ssh-keys.tar.gz.age\nBAD   only one recipient: losing the key loses the whole vault\nlog: ~/Library/Logs/vault-selfcheck-fail-20260824-031500.log'
    }
  },
  {
    id: 'job-silent', title: 'Задача перестала отчитываться',
    forum: 'PlayHub · Game Publisher · Arvent',
    when: 'сторож на сервере не увидел отметки в срок',
    live: ['new', 'новая форма — доедет после выкатки сервера PlayHub'],
    sender: 'scripts/heartbeat-check.sh',
    expectTag: '#job #daily_import',
    event: {
      type: 'job', project: 'playhub', key: 'daily-import',
      job: 'Yandex game import', status: 'silent', note: 'no report in time',
      expected: 'at least once every 26h', lastSeen: '23.08 04:12'
    },
    note: 'Молчание — это СОСТОЯНИЕ задачи, а не отдельный вид события. Раньше оно уходило тегом #heartbeat, и получалось, что одна задача по расписанию живёт под двумя разными тегами, а вторая строка называла датчик («Heartbeat: miss»), а не то, что случилось. Хуже: сторож шлёт тот же машинный ключ, что и сама задача, а пара «сломалось → починилось» ищется по ПОЛНОЙ строке тегов — значит красную весть о молчании не закрывала зелёная весть о том, что задача отработала.'
  },
  {
    id: 'job-silent-ok', title: 'Задача снова отчитывается',
    forum: 'PlayHub · Game Publisher · Arvent',
    when: 'после молчания задача снова оставила отметку',
    live: ['new', 'новая форма — доедет после выкатки сервера PlayHub'],
    sender: 'scripts/heartbeat-check.sh — или просто удачный прогон самой задачи',
    expectTag: '#job #daily_import',
    event: {
      type: 'job', project: 'playhub', key: 'daily-import',
      job: 'Yandex game import', status: 'ok', note: 'reporting again',
      expected: 'at least once every 26h', lastSeen: '25.08 04:10'
    },
    note: 'Тег тот же, что у красной карточки выше, — вот как выглядит пара «сломалось → починилось». Теперь её закрывает и сторож, и обычный удачный прогон задачи: поток один. И время подписано по-другому — «last seen», пока задачи не видно, и «last run», когда она вернулась.'
  },
  {
    id: 'file', title: 'Карточка с вложением',
    forum: 'Arvent', when: 'после вечернего прогона качества ответов бота',
    live: ['new', 'после выпуска 1.4.2'],
    sender: 'arvent-eval-report.sh',
    expectTag: '#job #arvent_eval',
    event: {
      type: 'job', project: 'arvent', key: 'arvent-eval',
      job: 'Eval: bot answer quality', status: 'ok',
      stats: [['verdict', '12 of 12 answers passed']],
      path: '/tmp/arvent-eval-24-08.txt',
      filename: 'arvent-eval-24-08.txt'
    },
    note: 'Отдельного вида «файл» больше нет: вложение — свойство ЛЮБОЙ карточки. Раньше прогон слал две карточки про одну новость — вердикт и лог под своим тегом; теперь лог прицеплен к самому вердикту. Подпись к вложению Telegram режет на 1024 знаках вместо 4000, поэтому очень длинный список замечаний в такой карточке укоротится — сам лог приезжает целиком.'
  }
];
