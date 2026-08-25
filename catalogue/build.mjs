// Renders every card with the package's OWN renderer and builds the page.
// Refuses to write the file if a card came out empty — a silently empty
// catalogue is exactly the lie this page exists to prevent.
import { render, eventKey } from '../dist/render.js';
import { severity } from '../dist/events.js';
import { CARDS } from './cards.mjs';
import { writeFileSync } from 'node:fs';

const ICON_CLASS = (html) =>
  html.includes('🚨') ? 'alarm' : html.includes('🔴') ? 'red' : html.includes('✅') ? 'ok' : 'info';

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

const TYPES = [
  ['#deploy', 'Выкатка сайта на сервер', '✅ / 🔴', 'deploy.yml, scripts/deploy.sh'],
  ['#ci', 'Проверка кода: линт, типы, тесты', '✅ / 🔴', 'nightly.yml, quality.yml'],
  ['#job', 'Задача по расписанию: крон, прогон на GitHub, синхронизация доски, бэкапы', '✅ / 🔴', 'notify-fail.sh и ещё 14 отправителей'],
  ['#report', 'Сводка с цифрами: аналитика за день и за неделю, релизы Alitools', 'ℹ️', 'analytics-cron.sh, сторожа Alitools'],
  ['#heartbeat', 'Задача не отметилась в срок — и она же, когда отметилась снова', '🔴 / ✅', 'heartbeat-check.sh'],
  ['#incident', 'Приложение или сейф сломались прямо сейчас', '🚨', 'vault.sh'],
  ['#session', 'Рабочая сессия на маке в беде: жжёт лимит, остановлена', '🚨', 'context-runaway-guard.sh'],
  ['#issue', 'Задача на доске GitHub: завели, назначили, закрыли', 'ℹ️ / ✅ закрыта', 'github-cards.py'],
  ['#pr', 'Pull request: открыли, закрыли, влили, и вердикт ревью', 'ℹ️ / ✅ влит, одобрен / 🔴 правки', 'github-cards.py'],
  ['#file', 'Файл вложением с подписью-карточкой', 'ℹ️', 'arvent-eval-report.sh']
];

// Numbered here, not in the list: hand-kept numbers went 07a, 07b the first
// time a card was inserted in the middle.
CARDS.forEach((c, i) => { c.no = String(i + 1).padStart(2, '0'); });

const articles = CARDS.map((c) => {
  // A card may be raw HTML the sender builds itself — the free-text report
  // goes through sendReport, which standardises delivery and nothing else,
  // so there is no event and no tag line to render.
  const html = c.raw ?? render(c.event);
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
  if (!c.raw && !c.expectTag) {
    throw new Error(`card ${c.id}: no expectTag — every rendered card must declare its tag line`);
  }
  const { tags, body } = c.raw
    ? { tags: '<span class="notag">строки тегов нет</span>', body: html.replace(/\n/g, '<br>') }
    : toBubble(html);
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
const typeRows = TYPES.map(([tag, what, icon, who]) =>
  `<tr><td><code>${tag}</code></td><td>${esc(what)}</td><td>${icon}</td><td><code>${esc(who)}</code></td></tr>`).join('\n');

writeFileSync(new URL('./nav.html', import.meta.url), nav);
writeFileSync(new URL('./articles.html', import.meta.url), articles);
writeFileSync(new URL('./types.html', import.meta.url), typeRows);
console.log(`built ${CARDS.length} cards`);
