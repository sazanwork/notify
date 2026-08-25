// Renders every card with the package's OWN renderer and builds the page.
// Refuses to write the file if a card came out empty — a silently empty
// catalogue is exactly the lie this page exists to prevent.
import { render, eventKey } from '../dist/render.js';
import { ICON, LOUD, severity } from '../dist/events.js';
import { CARDS } from './cards.mjs';
import { writeFileSync, statSync, readdirSync } from 'node:fs';

// The page draws its cards with the COMPILED package, not the sources. Edit
// `src/` without running `npm run build` and the page silently shows the
// renderer of the last build — which is exactly what happened on 25.08.2026:
// the owner was told the groups were on the page, looked, and they were not.
// A page that lies about what will arrive is worse than no page.
{
  const newest = (dir) =>
    Math.max(...readdirSync(new URL(dir, import.meta.url)).map((f) =>
      statSync(new URL(dir + f, import.meta.url)).mtimeMs));
  if (newest('../src/') > newest('../dist/')) {
    throw new Error('dist is older than src — run `npm run build` first, or the page shows the previous renderer');
  }
}

// The stripe down the left of a bubble follows the ICON, the same way the
// sound does. Anything that rings gets a warm stripe; the rest are quiet.
const STRIPE = {
  '🚨': 'alarm', '🔴': 'red', '🚫': 'wait', '❓': 'wait',
  '✅': 'ok', '👍': 'ok', '🎉': 'ok',
  '🆕': 'info', '🙋': 'info', '🗑️': 'info', '📝': 'info', 'ℹ️': 'info'
};
const ICON_CLASS = (html) => {
  const line = html.split('\n')[1] ?? '';
  const hit = Object.keys(STRIPE).find((i) => line.startsWith(i));
  return STRIPE[hit] ?? 'info';
};

// The package emits Telegram HTML with real newlines and <blockquote>. The page
// shows it inside a bubble, so newlines become <br> and the quote becomes the
// bubble's own quote span. Nothing else is touched.
const toBubble = (html) => {
  const [tagLine, ...rest] = html.split('\n');
  const tags = tagLine.trim().split(/\s+/).map((t) => `<span>${t}</span>`).join(' ');
  const body = rest.join('\n')
    .replace(/<blockquote(?: expandable)?>/g, '<span class="q">')
    .replace(/<\/blockquote>/g, '</span>')
    .replace(/\n/g, '<br>')
    .replace(/<br>(<span class="q">)/g, '$1')
    .replace(/(<\/span>)<br>/g, '$1');
  return { tags, body };
};

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// The type table's middle column is RENDERED, not written: line 2 of a card is
// `<icon> <b>Type:</b> action`, and the owner asked to see every one of them —
// which icon goes with which word for each type. A hand-kept list would drift
// from ICON/PR_ICON/ISSUE_ICON the first time one of them changed.
const P = { project: 'playhub' };
const TYPES = [
  {
    tag: '#deploy', what: 'Выкатка сайта на сервер',
    who: 'deploy.yml, scripts/deploy.sh',
    lines: [
      ['выкатилось', { type: 'deploy', ...P, status: 'ok' }],
      ['не выкатилось', { type: 'deploy', ...P, status: 'fail' }]
    ]
  },
  {
    tag: '#ci', what: 'Проверка кода: линт, типы, тесты',
    who: 'nightly.yml, quality.yml',
    lines: [
      ['прошла', { type: 'ci', ...P, status: 'ok' }],
      ['упала', { type: 'ci', ...P, status: 'fail' }]
    ]
  },
  {
    tag: '#job', what: 'Задача по расписанию: крон, прогон на GitHub, синхронизация доски, бэкапы. Всё про одну задачу идёт одним тегом',
    who: '20 файлов, от notify-fail.sh до board.yml',
    lines: [
      ['отработала', { type: 'job', ...P, job: 'x', status: 'ok' }],
      ['упала', { type: 'job', ...P, job: 'x', status: 'fail' }],
      ['выключена извне — не упала, а отключена', { type: 'job', ...P, job: 'x', status: 'disabled' }],
      ['молчит — не упала, а вообще не подала признаков жизни', { type: 'job', ...P, job: 'x', status: 'silent' }]
    ]
  },
  {
    tag: '#report', what: 'Сводка с цифрами: аналитика за день и за неделю, релизы Alitools',
    who: 'analytics-cron.sh, сторожа Alitools',
    lines: [
      ['всегда к сведению; на месте действия — НАЗВАНИЕ отчёта, и оно же ссылка',
       { type: 'report', ...P, title: 'Analytics for 2026-08-22', period: 'compared with 2026-08-21', url: 'https://x' }]
    ]
  },
  {
    tag: '#incident', what: 'Приложение или сейф сломались прямо сейчас',
    who: 'vault.sh',
    lines: [['одна строка на все случаи', { type: 'incident', ...P, title: 'x' }]]
  },
  {
    tag: '#session', what: 'Рабочая сессия на маке жжёт лимит',
    who: 'context-runaway-guard.sh',
    lines: [['на месте действия — что именно случилось с сессией; зелёной пары у этого тега нет — сессия не выздоравливает, она заканчивается',
             { type: 'session', ...P, action: 'burning the limit', status: 'fail' }]]
  },
  {
    tag: '#issue', what: 'Задача на доске GitHub',
    who: 'github-cards.py, ops-notify.yml',
    lines: [
      ['завели', { type: 'issue', ...P, action: 'opened', number: 1, title: 'x' }],
      ['назначили исполнителя', { type: 'issue', ...P, action: 'assigned', number: 1, title: 'x' }],
      ['закрыли', { type: 'issue', ...P, action: 'closed', number: 1, title: 'x' }]
    ]
  },
  {
    tag: '#pr', what: 'Pull request и вердикт ревью',
    who: 'github-cards.py, ops-notify.yml',
    lines: [
      ['открыли', { type: 'pr', ...P, action: 'opened', number: 1, title: 'x' }],
      ['влили', { type: 'pr', ...P, action: 'merged', number: 1, title: 'x' }],
      ['закрыли, не влив', { type: 'pr', ...P, action: 'closed', number: 1, title: 'x' }],
      ['ревьюер одобрил', { type: 'pr', ...P, action: 'approved', number: 1, title: 'x' }],
      ['ревьюер запросил правки',
       { type: 'pr', ...P, action: 'changes_requested', number: 1, title: 'x' }]
    ]
  },
];

// Numbered here, not in the list: hand-kept numbers went 07a, 07b the first
// time a card was inserted in the middle.
CARDS.forEach((c, i) => { c.no = String(i + 1).padStart(2, '0'); });

const articles = CARDS.map((c) => {
  // A card may be raw HTML the sender builds itself — the free-text report
  // goes through sendReport, which standardises delivery and nothing else,
  // so there is no event and no tag line to render.
  // Свободного текста в уведомлениях больше нет: последний отчёт стал
  // типизированным событием 25.08.2026. Ветка `raw` снята — если она
  // понадобится снова, это будет означать, что дверь открыли обратно.
  const html = render(c.event);
  if (!html || html.split('\n').length < 2) {
    throw new Error(`card ${c.id} rendered empty — refusing to build`);
  }
  // The tag line is the thing the page got wrong before: dropping the `key`
  // the real sender passes made six cards teach a tag that never exists. So
  // the expected tag line is declared beside the card and checked here.
  if (c.expectTag && html.split('\n')[0].trim() !== c.expectTag) {
    throw new Error(
      `card ${c.id}: tag line is "${html.split('\n')[0].trim()}", the sender produces "${c.expectTag}"`
    );
  }
  // A field is `<b>Label:</b> value`, and that colon is the ONE separator the
  // format has. A value carrying a second one — `0 / 0`, `name · scope` — is a
  // pair of facts smuggled onto one line, which is what the owner keeps
  // catching by eye. An em dash is left alone: inside a value it is prose.
  {
    for (const line of html.split('\n')) {
      const m = /<b>[^<]+:<\/b>(.*)$/.exec(line);
      if (m && / \/ | · /.test(m[1].replace(/<[^>]+>/g, ''))) {
        throw new Error(
          `card ${c.id}: a field value carries a second separator — split it into two lines: ${line.replace(/<[^>]+>/g, '')}`
        );
      }
    }
  }
  // Имя ссылки называет то, куда она ведёт. Слово-заглушка вместо имени — это
  // ровно та строка «Details: open», из-за которой владелец спрашивал, что
  // такое «open»: щёлкать предлагают, а куда — не сказано. `the run` в этом
  // списке намеренно: рендерер ставит его последним средством, когда прогон
  // есть, а имени у него нет ни одного, и такая карточка означает отправителя,
  // забывшего имя, — пусть страница краснеет на нём.
  {
    // Пояснение под карточкой — две фразы, не журнал изменений. Оно росло тем,
  // что я дописывал к нему новую правку вместо того, чтобы переписать: одно
  // выросло до 2400 знаков, и владелец справедливо отказался это читать.
  if (c.note && c.note.length > 320) {
    throw new Error(
      `card ${c.id}: the note is ${c.note.length} characters — say what is different now, ` +
      `in two sentences; the history is in git log`
    );
  }

  const BARE = new Set(['open', 'run', 'here', 'link', 'the run', 'details']);
    for (const m of html.matchAll(/<a href="[^"]*">([^<]*)<\/a>/g)) {
      if (BARE.has(m[1].trim().toLowerCase())) {
        throw new Error(`card ${c.id}: a link named "${m[1]}" — name the thing it opens, not the click`);
      }
    }
  }
  // Команда без объяснения в карточку не попадает вовсе — значит отправитель
  // молча потерял бы строку. Ловим здесь, а не тишиной в чате.
  if (c.event?.command && !c.event.commandNote) {
    throw new Error(`card ${c.id}: a command with no commandNote — it would be dropped, not shown`);
  }
  if (!c.expectTag) {
    throw new Error(`card ${c.id}: no expectTag — every rendered card must declare its tag line`);
  }
  const { tags, body } = toBubble(html);
  const cls = ICON_CLASS(html);
  const [liveCls, liveText] = c.live;
  const note = c.note ? `<p class="delta"><span>Меняется</span>${c.note}</p>` : '';
  return `<article id="${c.id}">
  <header>
    <p class="no">${c.no}</p>
    <h2>${esc(c.title)}</h2>
    <dl>
      <div><dt>Форум</dt><dd>${esc(c.forum)}</dd></div>
      <div><dt>Когда</dt><dd>${esc(c.when)}</dd></div>
      <div><dt>Кто шлёт</dt><dd><code>${esc(c.sender)}</code></dd></div>
      <div><dt>Сейчас</dt><dd class="live ${liveCls}">${esc(liveText)}</dd></div>
    </dl>
  </header>
  <div class="panes"><section class="pane only">
       <h3>Как приходит</h3>
       <div class="bubble ${cls}"><p class="tags">${tags}</p><div class="msg">${body}</div></div>
     </section></div>
  ${note}
</article>`;
}).join('\n');

const nav = CARDS.map((c) => `<a href="#${c.id}"><b>${c.no}</b> ${esc(c.title)}</a>`).join('');
// Line 2 comes out of the renderer itself and is shown verbatim, tags stripped.
const line2 = (event) => {
  const rendered = render(event).split('\n')[1];
  if (!rendered || !rendered.includes('<b>')) {
    throw new Error(`type table: ${event.type} produced no second line`);
  }
  return rendered.replace(/<a href="[^"]*">/g, '').replace(/<\/a>/g, '');
};

// The sound is not a second opinion — it follows the icon. Shown so he can see
// that it does, and so the page goes red the day it stops being true.
const sound = (event) => {
  const loud = severity(event) === 'error';
  const icon = [...LOUD].find((i) => render(event).split('\n')[1].startsWith(i));
  if (loud !== Boolean(icon)) {
    throw new Error(`type table: ${event.type} — icon and sound disagree`);
  }
  return loud ? 'со звуком' : 'беззвучно';
};

// The legend is generated from ICON, and the sound column from LOUD, so the
// page cannot promise him a meaning or a sound the package does not honour.
const MEANING = {
  ok: 'прошло, закрыто, готово',
  red: 'сломалось',
  alarm: 'горит прямо сейчас',
  off: 'выключено — само не запустится, пока кто-то не включит обратно',
  unknown: 'не отчиталось: живо оно или нет — неизвестно',
  fresh: 'появилось новое',
  taken: 'кто-то взял на себя',
  landed: 'влито — работа приехала',
  discarded: 'закрыто, не доведя до результата',
  approved: 'человек одобрил',
  changes: 'человек просит правки — это не поломка',
  info: 'сводка, к сведению'
};
const missing = Object.keys(ICON).filter((k) => !MEANING[k]);
if (missing.length) {
  throw new Error(`legend: no meaning written for ${missing.join(', ')}`);
}
const iconRows = Object.entries(ICON)
  .map(([name, icon]) =>
    `<tr><td class="ic">${icon}</td><td>${esc(MEANING[name])}</td>` +
    `<td>${LOUD.has(icon) ? 'со звуком' : 'беззвучно'}</td></tr>`)
  .join('\n');

const typeRows = TYPES.map((t) => {
  const rows = t.lines
    .map(([when, ev]) => `<div class="l2"><code>${line2(ev)}</code><b>${sound(ev)}</b><i>${esc(when)}</i></div>`)
    .join('');
  return `<tr><td><code>${t.tag}</code><br><small>${esc(t.what)}</small></td>` +
         `<td>${rows}</td><td><code>${esc(t.who)}</code></td></tr>`;
}).join('\n');

writeFileSync(new URL('./icons.html', import.meta.url), iconRows);
writeFileSync(new URL('./nav.html', import.meta.url), nav);
writeFileSync(new URL('./articles.html', import.meta.url), articles);
writeFileSync(new URL('./types.html', import.meta.url), typeRows);
console.log(`built ${CARDS.length} cards`);
