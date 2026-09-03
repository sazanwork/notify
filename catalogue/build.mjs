// Renders every card with the package's OWN renderer and builds the page.
// Refuses to write the file if a card came out empty — a silently empty
// catalogue is exactly the lie this page exists to prevent.
import { render, eventKey, OUTCOME_TAG } from '../dist/render.js';
import { ICON, LOUD, severity } from '../dist/events.js';
import { lintCard } from '../dist/lint.js';
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
      ['выкатилось', { type: 'deploy', ...P, status: 'ok', workflowName: 'Deploy to Beget' }],
      ['не выкатилось', { type: 'deploy', ...P, status: 'fail', workflowName: 'Deploy to Beget' }]
    ]
  },
  {
    tag: '#ci', what: 'Проверка кода: линт, типы, тесты',
    who: 'nightly.yml, quality.yml',
    lines: [
      ['прошла', { type: 'ci', ...P, status: 'ok', workflowName: 'nightly' }],
      ['упала', { type: 'ci', ...P, status: 'fail', workflowName: 'nightly' }]
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
       { type: 'report', ...P, title: 'Analytics for 2026-08-22', aside: 'compared with 2026-08-21', url: 'https://x' }]
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
  // Every card on this page is a rendered event. The free-text door is gone
  // from the package itself since 25.08.2026, so there is no second branch
  // here and no way for the page to show something the type system cannot.
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
  // format has. A value carrying another one is a pair of facts smuggled onto
  // one line, which is what the owner keeps catching by eye.
  //
  // The slash is the exception, and it is the exception because he chose it:
  // `51 / 46 ▲5` is now first-number-slash-second, one fact in three parts,
  // and the same slash separates the two dates in a report's bracket. So a
  // slash is allowed only in that shape — between two numbers or two dates —
  // and `name / scope` still fails.
  {
    // A slash is the comparison mark only when what stands on each side of it
    // is a number or a date. `2026-08-23 / 2026-08-22` and `51 / 46` pass
    // wherever they sit — including inside the bracket after a report's name.
    // `name / scope` does not.
    const NUMBERISH = /^-?[\d.]+%?$|^\d{4}-\d{2}-\d{2}$/;
    const comparison = (value) =>
      [...value.matchAll(/(\S+)\s\/\s(\S+)/g)].every(
        (m) => NUMBERISH.test(m[1].replace(/[(),]/g, '')) && NUMBERISH.test(m[2].replace(/[(),]/g, ''))
      );
    // A row whose every part is a LINK is a list of pointers, not a value
    // crammed with facts — `Source: workflow run · commit 9b1fc68` is two
    // places to click, and one label above them reads better than two rows
    // both saying `Source`. The check stays narrow on purpose: every segment
    // must be a whole `<a>` and nothing else, so a real value that merely
    // happens to contain a link is still caught.
    const allLinks = (raw) =>
      raw
        .split(' · ')
        .every((part) => /^\s*<a href="[^"]*">[^<]*<\/a>\s*$/.test(part));
    // A pointer and its name on one row — `Commit: <a>9b1fc68</a> · feat: …`
    // (03.09.2026) — is the one shape where the dot joins two halves of ONE
    // fact, the same way `PR #414 · title` does on line 2: the hash is the
    // link, the title says what it did. Exactly one link first, then the name.
    // The `!/ · .* · /` clause that used to stand here made the exception
    // refuse its own shape: a legal `Commit: <a>hash</a> · fix: a · b` — a
    // commit whose TITLE contains a dot separator — still threw. The regex
    // above already pins the row: exactly one link, then one ` · `, then free
    // text to the end. Whatever the title holds is one fact, not a second one.
    const pointerThenName = (raw) => /^\s*<a href="[^"]*">[^<]*<\/a> · [^\n]+$/.test(raw);
    for (const line of html.split('\n')) {
      const m = /<b>[^<]+:<\/b>(.*)$/.exec(line);
      const value = m ? m[1].replace(/<[^>]+>/g, '').trim() : '';
      if (m && / · /.test(value) && !allLinks(m[1]) && !pointerThenName(m[1])) {
        throw new Error(
          `card ${c.id}: a field value carries a second separator — split it into two lines: ${line.replace(/<[^>]+>/g, '')}`
        );
      }
      if (m && / \/ /.test(value) && !comparison(value)) {
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
    // One place for a card-level fact. Every card puts the facts ABOUT the thing
  // between the type line and the first group heading; a heading opens a
  // different subject (the commit, the copies, the disabled workflows). Deploy
  // and CI used to wrap theirs in a `Run` heading, so `Reason:` sat against the
  // name on a job card and under a heading on a deploy one, and the owner asked
  // which of the two was the standard.
  //
  // `Actor` is NOT in this list any more (25.08.2026): it names who is behind
  // the COMMIT, not a fact about the run itself, so it belongs under `Change`
  // next to the commit — the owner: "commit, actor, workflow — I don't know,
  // it's all a jumble." `Reason` stays banned from a heading: it IS a fact
  // about the run.
  {
    const rows = html.split('\n');
    const firstGroup = rows.findIndex((r) => r.includes('<i><u>'));
    for (const label of ['Reason']) {
      const at = rows.findIndex((r) => r.startsWith(`<b>${label}:</b>`));
      if (at !== -1 && firstGroup !== -1 && at > firstGroup) {
        throw new Error(
          `card ${c.id}: "${label}:" sits under a group heading. A fact about the card ` +
          `itself belongs above the first heading, where every other card puts it.`
        );
      }
    }
    // And the mirror of it: the timetable is NOT a fact about this event, so it
    // lives under `Schedule` and never in the header.
    for (const label of ['Expected', 'Last run', 'Last seen']) {
      const at = rows.findIndex((r) => r.startsWith(`<b>${label}:</b>`));
      if (at !== -1 && (firstGroup === -1 || at < firstGroup)) {
        throw new Error(
          `card ${c.id}: "${label}:" stands in the header. The timetable is its own ` +
          `subject and belongs under the Schedule heading.`
        );
      }
    }
  }

  // One number, one shape. A comparison is an arrow — ▲ ▼ = — and a number
  // with nothing behind it is printed bare. A signed number is neither: the
  // morning server report printed `210 +3` for a real comparison and `+37`
  // for a plain count of today, next to analytics printing `485 ▲207`. The
  // owner read the page and asked what the plus signs were.
  //
  // The guard used to read `lines` only — one field of four. A job's `stats`,
  // a flat `items` list and a grouped report's items all carry values too, and
  // `stats: [['Added', '+6']]` sailed past it. Every value the card can print
  // is collected here, so the next field cannot quietly opt out.
  //
  // `factValues` covers an item's nested `facts` sub-rows (a search query's
  // Clicks/Position) — found missing by GLM review 2026-08-26: those are
  // numbers too, and a signed one there was as invisible to this guard as
  // `stats` used to be. A group is `{ name, items }` in the schema — there is
  // no `g.lines`, so the old spread there was always an empty array; dropped.
  const factValues = (items) =>
    (items ?? []).flatMap((i) => (i.facts ?? []).map(([label, value]) => [label, value]));

  const values = [
    ...(c.event?.lines ?? []),
    ...(c.event?.stats ?? []),
    ...(c.event?.items ?? []).map((i) => [i.text ?? '', i.text ?? '']),
    ...factValues(c.event?.items),
    ...(c.event?.groups ?? []).flatMap((g) => [
      ...(g.items ?? []).map((i) => [i.text ?? '', i.text ?? '']),
      ...factValues(g.items)
    ])
  ];

  for (const [label, value] of values) {
    if (typeof value === 'string' && /(^|\s)[+\-]\d/.test(value)) {
      throw new Error(
        `card ${c.id}, row "${label}": "${value}" — a signed number is not a comparison. ` +
        `Call trend(now, was) for an arrow, or pass the number bare.`
      );
    }
  }

  // A total cannot stand still while its parts move. `Games 412` sat above
  // `iOS 210 ▲3` and `Android 202 ▲5`, and the owner asked how the count had
  // not grown. A card declares its own arithmetic with `sums`, and the numbers
  // AND the arrows are checked against it.
  const num = (v) => {
    const m = String(v).match(/^(-?[\d.]+)/);

    return m ? Number(m[1]) : null;
  };
  const move = (v) => {
    const m = String(v).match(/([▲▼])([\d.]+)/);

    if (String(v).includes('=')) return 0;

    return m ? (m[1] === '▲' ? Number(m[2]) : -Number(m[2])) : null;
  };

  for (const [total, parts] of c.sums ?? []) {
    const row = (label) => (c.event?.lines ?? []).find(([l]) => l === label);
    const totalRow = row(total);

    if (!totalRow) throw new Error(`card ${c.id}: sums names "${total}", which is not a row`);

    const partRows = parts.map((label) => {
      const r = row(label);

      if (!r) throw new Error(`card ${c.id}: sums names "${label}", which is not a row`);

      return r;
    });
    const sum = partRows.reduce((a, [, v]) => a + (num(v) ?? 0), 0);

    if (num(totalRow[1]) !== sum) {
      throw new Error(
        `card ${c.id}: "${total}" is ${num(totalRow[1])} but ${parts.join(' + ')} is ${sum}`
      );
    }
    const moved = partRows.reduce((a, [, v]) => a + (move(v) ?? 0), 0);

    if ((move(totalRow[1]) ?? 0) !== moved) {
      throw new Error(
        `card ${c.id}: "${total}" moved ${move(totalRow[1]) ?? 0} but its parts moved ${moved} — ` +
        `a total cannot stand still while what it is made of moves`
      );
    }
  }

  // Advice is the last thing on a card and it exists only when there is
  // advice. `Recommendations: all good` printed a STATUS in the place of a
  // recommendation, and it stood above the machine's health.
  const groupNames = (c.event?.groups ?? []).map((g) => g.name);
  const recAt = groupNames.indexOf('Recommendations');

  if (recAt !== -1) {
    if (recAt !== groupNames.length - 1) {
      throw new Error(`card ${c.id}: Recommendations is not the last group — advice goes under what it is drawn from`);
    }
    for (const item of c.event.groups[recAt].items ?? []) {
      if (/^(all good|ok|fine|nothing)$/i.test((item.text ?? '').trim())) {
        throw new Error(`card ${c.id}: "${item.text}" is a status, not a recommendation — where there are none, print none`);
      }
    }
  }

  // The same check the package runs on every live card before it is sent. The
  // page and the wire cannot drift apart: one list of rules, two places that
  // read it.
  const faults = lintCard(html);

  if (faults.length > 0) {
    throw new Error(`card ${c.id}: ${faults.join('; ')}`);
  }

  // Line 2 holds the NAME of the thing. Not the outcome — the icon and the
  // third tag already say that twice — and not a word invented to fill the
  // slot. `Deploy: fail`, `Report: open` and `CI: the run` all shipped at some
  // point, and each of them read as a name until you looked twice.
  const NOT_A_NAME = new Set([
    'ok', 'fail', 'failed', 'error', 'success', 'disabled', 'silent', 'unknown',
    'open', 'the run', 'run', 'done', 'undefined', 'null'
  ]);
  // `[1]`, not `[0]`: `html` carries the tag line first, and a guard reading
  // the tag line can never see line 2 at all — it would pass every card
  // forever and prove nothing.
  const second = html.split('\n')[1] ?? '';
  const named = second.match(/<b>[^<]+:<\/b>\s*(?:<a href="[^"]*">)?([^<]*)/);

  if (named && NOT_A_NAME.has(named[1].trim().toLowerCase())) {
    throw new Error(
      `card ${c.id}: line 2 says "${named[1].trim()}" where the name of the thing belongs. ` +
      `The outcome is already the icon and the third tag.`
    );
  }

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
  // The page renders the package's TEXT output — it cannot show a real
  // Telegram file upload, which travels alongside the caption, not inside
  // it. Without a marker the owner looked at a text-only bubble and asked
  // "where's the file?" — there was nothing on the page saying one exists.
  const attachment = c.event?.filename
    ? `<p class="delta"><span>📎 Вложение</span>файл <code>${esc(c.event.filename)}</code> едет вместе с этим сообщением как отдельный файл — сама страница показывает только подпись, файл она нарисовать не может.</p>`
    : '';
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
  ${attachment}
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
// The tag column comes from the package's own table, so the page cannot show a
// tag the renderer would not print. One icon meaning, one tag: `#off` is not
// `#fail`, and a task that has gone quiet is `#unknown`, not either of them.
const iconRows = Object.entries(ICON)
  .map(([name, icon]) =>
    `<tr><td class="ic">${icon}</td><td>${esc(MEANING[name])}</td>` +
    `<td>${LOUD.has(icon) ? 'со звуком' : 'беззвучно'}</td>` +
    `<td><code>#${OUTCOME_TAG[icon] ?? 'info'}</code></td></tr>`)
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
