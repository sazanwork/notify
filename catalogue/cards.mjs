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
    note: 'Чем выкатили — второй строкой, рядом со словом Deploy, и это же ссылка на прогон. Раньше один факт был разрезан надвое: «Via: GitHub Actions» в середине карточки и «Workflow: …» отдельной строкой в самом низу. У One-Q нижняя строка вырождалась в «Workflow: Deploy» — повтор слова из второй строки, не называющий ничего. Имя ссылки теперь всегда имя самого workflow: «GitHub Actions» одинаково на каждой карточке в каждом репозитории, и щелчок по нему не говорил, куда ты идёшь.'
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
    note: 'Вот здесь видны группы, которых нет на зелёной карточке, и это не случайность: у зелёной выкатки нет ни цели, ни причины — блок один, различать нечего, и заголовок был бы словом ради слова. Как только появляется что различать — прогон отдельно, изменение отдельно, — заголовки встают сами. Красную карточку показывает именно этот вид: прогон сняли уже после того, как сервер обновился, и проверить рабочий сайт придётся руками.'
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
    note: 'Серая цитата — это тело коммита, и она появляется, только если автор его написал. Твой скриншот был короче именно поэтому: у того коммита тела не было, и цитировать было нечего. С 25.08.2026 такие коммиты в 25 репозиториях машины просто не создаются — гард не даёт закоммитить без тела. Пять пропущены намеренно: в четырёх файл хука лежит в самом git и репозиторий не только его, в пятом хуки вынесены наружу. Остаться карточка без цитаты может от коммита, сделанного мимо этой машины: слияние кнопкой на GitHub, чужой коммит, коммит старше гарда.'
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
      lines: [
        ['Humans', '262 ▲23', 'Server log'],
        ['Game plays', 0, 'GA4'],
        ['Users', 1, 'GA4'],
        ['Clicks', 0, 'Google Search'],
        ['Impressions', 0, 'Google Search'],
        ['Visible', '0.4% of visitors — the rest gave no consent', 'Coverage']
      ],
      groups: [{ name: 'Top search queries', items: [{ label: 'игры для мальчиков', text: '4 clicks, pos. 12' }] }],
      url: 'https://github.com/sazanwork/game-publisher/blob/master/docs/analytics/2026-08-22.md'
    },
    note: 'Строки «Compared with» здесь больше нет. У дневного отчёта база сравнения — вчера, каждый день, поэтому строка каждый день говорила одно и то же и занимала место. Смысл в ней появляется ровно в одном случае: за вчера снимка нет — сервер лежал или крон не отработал, — и стрелки ▲ посчитаны от позавчера. Тогда строка возвращается и говорит об этом прямо: «Compared with: 2026-08-19 — the days between have no data». У недельного отчёта она была просто неверной: сравнение там с прошлой неделей, а в строку подставлялся соседний ДЕНЬ. Источник числа теперь заголовок группы, а не хвост ярлыка: было «GA4 users», «Google clicks», «Humans in the server log» — три способа приписать источник к ярлыку; стало четыре группы и короткие ярлыки. Поисковый запрос внизу стоял через тире — «игры для мальчиков — 4 clicks». Тире делало работу двоеточия, а третьего знака препинания в формате быть не должно: запрос теперь ярлык, как и всё остальное. Значок 💡 у ярлыка ушёл по той же причине — ярлык это слово. А сами поисковые запросы переехали в именованную группу: запрос по-русски остаётся по-русски, это набрал живой человек, но заголовок группы английский и говорит, что это за строки — иначе русский запрос читался как русский ярлык. Ссылка переехала с отдельной строки «Details: open» на само название отчёта. И тег: раньше отчёт не передавал ключ, поэтому тег собирался из заголовка с датой и был новым КАЖДЫЙ день — пара «сломалось → починилось» по нему не находилась никогда. Теперь ключ постоянный.'
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
      lines: [
        ['Pageviews', 7882, 'Server log'],
        ['Game plays', 156, 'GA4'],
        ['Users (sum of days)', 345, 'GA4'],
        ['Visitors (sum of days)', 331, 'Metrica'],
        ['Clicks', 0, 'Google Search'],
        ['Impressions', 6, 'Google Search'],
        ['Visible', '4.4% of server pageviews (sum of days)', 'Coverage']],
      groups: [{ name: 'Top search queries', items: [{ label: 'online games ru', text: '0 clicks, pos. 55' }] }]
    },
    note: 'Карточка теперь дословно повторяет то, что печатает отправитель, — числа взяты из его настоящего вывода за неделю 18–24 августа. «Compared with: the week before» отсюда ушло: недельный отчёт сравнивается с прошлой неделей по определению, а в эту строку подставлялся соседний ДЕНЬ, то есть она была просто неверной. Ярлык «💡 GA4 sees» стал «Visible» в группе Coverage: значок делал работу заголовка группы. И появился постоянный ключ analytics-weekly — раньше тег собирался из заголовка с датами недели и был новым каждую неделю.'
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
      title: 'russkie-igry.ru', url: 'https://russkie-igry.ru', period: '25.08.2026',
      lines: [
        ['Number', 128],
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
    note: 'Последняя карточка, которая шла свободным текстом, — и та единственная, у которой не было тегов. Тело собиралось руками и несло три разделителя сразу: вертикальную черту между блоками, точку внутри скобок и тире перед числом. Теперь это обычное типизированное событие: один факт — одна строка, списки — именованные группы, рисует пакет. Свободного текста в уведомлениях больше нет нигде.'
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
    note: 'Раньше это уходило под тегом #job — а сессия не задача по расписанию. Теперь свой тип, а имя сессии — та строка, которой ты её открыл, целиком в цитате: полем оно обрезалось. Команда внизу больше не голая: над ней стоит строка «To do», которая говорит, что именно она сделает. Пакет ОТКАЗЫВАЕТСЯ печатать команду без такого объяснения — команду, которую нельзя прочитать, нельзя и выполнить.'
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
      stats: [['Published', 3]],
      items: [
        { text: 'Cut the Rope', url: 'https://russkie-igry.ru/ru/game/cut-the-rope/', group: 'New today' },
        { text: 'Vex 7', url: 'https://russkie-igry.ru/ru/game/vex-7/', group: 'New today' },
        { text: 'Bloxorz', url: 'https://russkie-igry.ru/ru/game/bloxorz/', group: 'Out of the backlog' },
        { text: 'Fireboy and Watergirl: the judge rejected the description', group: 'Did not come out' },
        { text: 'Nomad: description was not generated', group: 'Did not come out' }
      ],
      url: 'https://russkie-igry.ru'
    },
    note: 'Строки «Task: Yandex game import» больше нет: имя задачи переехало на вторую строку, к самому слову Job, как у отчёта и у задачи с доски. Раньше вторую строку занимал исход («Job: ok»), а имя стояло ниже под вторым ярлыком — Task и Job были двумя словами про одно и то же. Исход теперь говорят значок и тег #ok / #fail, а два состояния, которые значком не читаются, оставили себе слово: выключенная задача пишет «State: switched off, not broken», замолчавшая — «State: no word from it at all». Здесь в одном перечне лежали ТРИ разные вещи, и различались они значком в начале строки: 🆕 вышло сегодня, 🔁 вышло из очереди, ⚠ не вышло совсем. Значок делал работу заголовка — теперь у каждой свой заголовок, а значки не нужны. Цифр было четыре (Total, New, From backlog, Stuck), и три из них были размерами этих же списков, то есть одно и то же сказано дважды; осталась одна — сколько опубликовано. Карточка собрана из настоящего вывода отправителя. Имя задачи — ссылка; отдельной строки «Workflow: open» нет, она вела туда же, а называлась глаголом. Этот отправитель передаёт адрес сайта, так что ссылка ведёт на сайт, а не на прогон.'
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
    note: 'Было одной строкой: «fresh copies: 10, broken: 1 — re-downloading…». Три факта и двоеточия внутри одного ярлыка «Reason». Счётчики стали своими строками, путь к логу — моноширинным, а под «Reason» осталось предложение.'
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
    note: 'Было хвостом: «red: a b c — which one exactly is in the log: /Users/…». Красные проверки стали списком, путь к логу — своей строкой.'
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
      actor: '@chelsnebes', note: 'nightly master check, full run: success',
      workflowUrl: 'https://github.com/sazanwork/arvent/actions/runs/1', workflowName: 'nightly'
    },
    note: 'Заголовка коммита и цитаты здесь НЕТ и быть не может: ночной прогон запускается по расписанию, а не по коммиту, и GitHub не даёт его заголовок. Раньше в поле «Commit» лежали две строки человеческого текста вместо хэша — текст переехал в «Reason». Имя проверки стоит второй строкой и оно же ссылка на прогон: раньше это была отдельная строка «Workflow» в самом низу карточки, и по ней нельзя было понять, какая именно проверка заговорила, не дочитав до конца.'
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
    note: 'Три события и только три: завели, назначили, закрыли. Переоткрыли или повесили ярлык — молчание, намеренно: одна новость — одно сообщение. Закрытая задача приходит зелёной.'
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
    note: '«Попросили ревью» и «переоткрыли» сюда не приходят намеренно: PR уже объявлен открытым, второе сообщение о том же — шум.'
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
    note: 'Единственный вид карточки PR, которая приходит КРАСНОЙ. Одобрение того же PR приходит зелёным под тем же тегом — это и есть пара «сломалось → починилось».'
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
    }
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
    note: 'Молчание — это СОСТОЯНИЕ задачи, а не отдельный вид события. Раньше оно уходило тегом #heartbeat, и получалось, что одна задача по расписанию живёт под двумя разными тегами, а вторая строка называла датчик («Heartbeat: miss»), а не то, что случилось. Хуже: сторож шлёт тот же машинный ключ, что и сама задача, а пара «сломалось → починилось» ищется по ПОЛНОЙ строке тегов — значит красную весть о молчании не закрывала зелёная весть о том, что задача отработала.'
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
    note: 'Тег тот же, что у красной карточки выше, — вот как выглядит пара «сломалось → починилось». Теперь её закрывает и сторож, и обычный удачный прогон задачи: поток один. И время подписано по-другому — «last seen», пока задачи не видно, и «last run», когда она вернулась.'
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
    note: 'Отдельного вида «файл» больше нет: вложение — свойство ЛЮБОЙ карточки. Раньше прогон слал две карточки про одну новость — вердикт и лог под своим тегом; теперь лог прицеплен к самому вердикту. Подпись к вложению Telegram режет на 1024 знаках вместо 4000, поэтому очень длинный список замечаний в такой карточке укоротится — сам лог приезжает целиком.'
  }
];
