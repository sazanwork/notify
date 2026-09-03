/**
 * One renderer per event type, all built on one skeleton — approved by
 * the owner on 20.08.2026 after ~15 live rounds in the test forum:
 *
 *   #type #instance
 *   icon <b>Type:</b> action
 *
 *   <b>Label:</b> value
 *   <blockquote>quoted text from someone else — commit body, task body</blockquote>
 *
 *   <i><u>Group</u></i>
 *   <b>#N (overdue):</b> <a>title</a>
 *
 *   <b>Label:</b> value   ← actions/directions
 *
 * Three levels of styling, never mixed: a field is a bold, capitalized
 * label plus a plain value; a group is italic+underline, no bold and no
 * colon; line 2 (the type) follows the same field rule. A blank line
 * separates BLOCKS BY MEANING (header / body / actions), not mechanically
 * after every line.
 */
import { ICON, LOUD, iconFor, type Item, type NotifyEvent } from './events.ts';

/**
 * A label gets a capital letter — but NOT a name that is deliberately
 * written lowercase: `iOS` was turning into `IOS`. The signal is a capital
 * second letter.
 */
const cap = (s: string): string => {
  if (s.length === 0 || /^[a-z][A-Z]/.test(s)) {
    return s;
  }

  return s.charAt(0).toUpperCase() + s.slice(1);
};

/** Escapes EVERYTHING that comes from outside — only the template adds tags. */
export const esc = (v: unknown): string =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * Telegram cuts a message at 4096 characters — we cut it ourselves first,
 * on a line boundary where possible.
 *
 * Two traps, both caused a SILENT loss of the message:
 * 1. Cutting strictly at the last `\n` does not work: if a long chunk runs
 *    as one line (a stack trace, command output — the most common `detail`
 *    on an incident), the last line break sits BEFORE it, and the whole
 *    content got dropped — only the heading arrived, with not a single
 *    fact about what broke.
 * 2. Cutting in the middle of an HTML tag or entity does not work either:
 *    Telegram replies `400 can't parse entities`, and we treat a 4xx as a
 *    permanent error and do not retry — the message disappeared for good.
 */
export const clampMessage = (text: string, limit = 4000, marker = '…'): string => {
  if (text.length <= limit) {
    return text;
  }

  const cut = text.slice(0, limit);
  const lastBreak = cut.lastIndexOf('\n');
  // Cut on a line boundary — only if that keeps most of the content.
  let end = lastBreak > limit * 0.6 ? lastBreak : limit;

  // Never cut inside `<...>` or inside `&...;` — otherwise the markup breaks.
  // The closing `>` must be searched for only up to `end`, not across all of
  // `cut`: a `>` that belongs to a LATER, already-doomed part of the message
  // (still inside `cut` because `cut` runs to `limit`, past `end`) used to
  // read as "this tag is closed" and let a tag get cut mid-attribute anyway —
  // found by GLM review, reproduces with a long `href` that straddles the
  // line-boundary cut point.
  const openTag = cut.lastIndexOf('<', end - 1);
  if (openTag !== -1 && cut.slice(openTag, end).indexOf('>') === -1) {
    end = openTag;
  }
  const amp = cut.lastIndexOf('&', end - 1);
  if (amp !== -1 && end - amp <= 10 && cut.indexOf(';', amp) === -1) {
    end = amp;
  }

  const body = cut.slice(0, end);
  // The clamp may have cut off closing tags — we add them back so the markup
  // matches. blockquote — since quoting arrived for notes/details, a long
  // detail gets cut right in the middle of it, and without this tag Telegram
  // would answer 400 on the unclosed quote (the regex `<blockquote[ >]` also
  // catches the variant with an `expandable` attribute).
  // `u` joined the list on 2026-08-25: a group heading renders as
  // `<i><u>…</u></i>`, and a long heading cut in the middle left `<u>` unclosed.
  // Telegram answers 400 to that — meaning the whole card disappeared, and the
  // sender with `|| true` never noticed. Codex found it; reproduces with a
  // report whose group name is 5000 characters long.
  //
  // Closing order is the reverse of OPENING order, not a fixed list. A fixed
  // list closed `<i><u>` as `</i></u>`: the tag count matches, but the nesting
  // is wrong, and Telegram answers with the same 400. Second round of the same
  // bug (25.08.2026), so now the order comes from the text itself: the last
  // one opened is the first one closed.
  const open: string[] = [];
  const tagRe = /<(\/?)(b|a|i|u|code|pre|blockquote)[ >]/g;
  for (let m = tagRe.exec(body); m !== null; m = tagRe.exec(body)) {
    if (m[1] === '/') {
      const at = open.lastIndexOf(m[2]);
      if (at !== -1) {
        open.splice(at, 1);
      }
    } else {
      open.push(m[2]);
    }
  }
  const tail = open
    .reverse()
    .map((t) => `</${t}>`)
    .join('');

  // The marker ANNOUNCES the cut instead of hiding it (v2.1): the caller
  // reserves the marker's length out of `limit` before calling, so the
  // marker itself can never be the thing that pushes the message over
  // Telegram's hard cap — a free addition on top of 4000/4096 plus a long
  // path was measured to earn a 400, and a 4xx is never retried.
  return `${body}${tail}\n${marker}`;
};

// Only the first line: a field is single-line by contract (commit, branch,
// author, a stat), not a place for a paragraph. A live case (18.08): a CI card
// carried the FULL commit body with a sub-commit history through `--commit`
// and instead of one line unrolled to 3000 characters — multi-line text is
// either a caller mistake, or it belongs in `note()`, not a silent bloat of
// the card.
const firstLine = (value: string | number): string | number => {
  if (typeof value === 'number' || !value.includes('\n')) {
    return value;
  }

  return `${value.split('\n')[0]}…`;
};

/**
 * A field: `<b>Label:</b> value` — a bold, capitalized label, a plain value.
 * `null` is dropped the same as `undefined`/`''` — the field's sources are
 * JSON on stdin (`--json`) and objects from the server, where a missing
 * value serializes as `null`, not as a missing key.
 */
const field = (label: string, value: string | number | null | undefined): string | null =>
  value === undefined || value === null || value === '' ? null : `<b>${esc(cap(label))}:</b> ${esc(firstLine(value))}`;

/**
 * A Reason-shaped field: one line stays an ordinary field, several lines
 * become a captioned quote — NOTHING is cut to the first line any more.
 * `field`'s silent `firstLine` on a multi-line reason was the v1 contract,
 * and it gutted every card whose failure did not fit one line (scp retries,
 * a three-line diagnosis): the owner saw `Connection timed…` and nothing
 * else. Confirmed live on four cards in the 14-day sweep, fixed in v2.1.
 */
const reason = (label: string, value: string | number | null | undefined): string | null => {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const text = String(value);

  return text.includes('\n') ? quoted(label, text) : field(label, text);
};

/**
 * An identifier field (`commit:`/`pr:`/`issue:`): the value is a link if
 * one exists, otherwise the plain text of the same field — an identifier
 * must not disappear entirely just because the caller did not pass a url.
 */
const fieldLink = (
  label: string,
  url: string | null | undefined,
  text: string | number | null | undefined
): string | null => {
  if (text === undefined || text === null || text === '') {
    return null;
  }

  // `firstLine` here for the same reason `field` has it: the linked case used to
  // skip it, so a multi-line value (arvent's two-line `commit`) became two-line
  // LINK TEXT instead of one identifier.
  return url
    ? `<b>${esc(cap(label))}:</b> <a href="${esc(url)}">${esc(firstLine(text))}</a>`
    : field(label, text);
};

/** A monospace field — a path/command to copy, not a link. */
const fieldCode = (label: string, value: string | undefined): string | null =>
  value ? `<b>${esc(cap(label))}:</b> <code>${esc(value)}</code>` : null;

/**
 * The owner himself, under the two names the senders know him by. A people
 * row that names the reader is not news: on the 49 PR and issue cards of the
 * week of 25.08.2026 `Author:` was him on every one, and the single row that
 * ever said something was `Assignee: Ilja-Prihach`. So a person row is printed
 * only when the person is someone else (03.09.2026).
 */
const OWNER = { github: 'mikitasazan', telegram: 'chelsnebes' } as const;

/**
 * A person field — Author, Assignee, Reviewer. Every one of them is a
 * GitHub login (`github-cards.py` reads it off `.user.login`/`.assignee.login`
 * on the GitHub API object), and every GitHub login is a profile at one fixed
 * address: `github.com/<login>`. The owner: "автор должен вести на страницу
 * автора" — a name is an identifier like a commit hash or a PR number, and
 * every other identifier on the card is a link.
 */
// `firstLine`, same as `fieldLink`: a login with an embedded `\n` (found by
// Codex/GLM review) would otherwise land a raw newline inside the `href`
// itself, not just the link text — every other field guards against a
// multi-line value, this one didn't.
const fieldPerson = (label: string, login: string | undefined): string | null => {
  if (!login) {
    return null;
  }
  const oneLine = firstLine(login) as string;
  if (oneLine.toLowerCase() === OWNER.github) {
    return null;
  }
  return `<b>${esc(cap(label))}:</b> <a href="https://github.com/${esc(oneLine)}">${esc(oneLine)}</a>`;
};

/**
 * `Actor` on a CI card is a Telegram handle, not a GitHub login
 * (`nightly.yml`, step "Кто чинит" — "по «@chelsnebes» приходит уведомление
 * тому, кто чинит, по «mikitasazan» — нет"), so it links to Telegram, not
 * GitHub: `github.com/@chelsnebes` would open a page that does not exist.
 * Telegram DOES auto-link a bare `@handle` on its own, but the owner asked
 * for an explicit link like every other identifier on the card, not an
 * implicit one riding on a client behavior he cannot see from here.
 */
const fieldTelegram = (label: string, handle: string | undefined): string | null => {
  if (!handle) {
    return null;
  }
  const oneLine = firstLine(handle) as string;
  const bare = oneLine.replace(/^@/, '');
  if (bare.toLowerCase() === OWNER.telegram) {
    return null;
  }
  return `<b>${esc(cap(label))}:</b> <a href="https://t.me/${esc(bare)}">${esc(oneLine)}</a>`;
};

/**
 * A row that asks something FROM THE OWNER, rather than reports a fact. It
 * already stood last, set off by a blank line, and still read as an
 * ordinary field among five others. The `▶` marker is the only difference:
 * a group heading here would have been a third line of markup on a card
 * that already has six (25.08.2026, two reviews against grouping), and the
 * marker spends none.
 */
/**
 * Action: what to do and with what. Without an explanation the command is
 * NOT printed at all — the owner on a bare `rm` in a card: "I don't even
 * know what I'm doing." Silently dropping the row is better than showing
 * him a command he cannot read; the sender is caught by the catalogue test
 * instead, not by silence in the chat.
 */
const fieldRun = (value: string | undefined, why: string | undefined): string[] => {
  const explain = field('To do', why);

  // No icon. `▶` was the only symbol of its kind across all twenty kinds of
  // cards, and the owner rightly asked what it meant: nothing that the row
  // `To do:` above it and the monospace font below it did not already say —
  // Telegram makes a row like that tap-to-copy on its own.
  return value && explain !== null ? [explain, `<code>${esc(value)}</code>`] : [];
};

/** A group heading: italic + underline, no bold, no colon. */
const group = (name: string): string => `<i><u>${esc(cap(name))}</u></i>`;

/**
 * An item inside a group: `<b>label:</b> <a>text</a>` — or a plain
 * bulleted/numbered row with no label. `facts`, when the item carries them,
 * print as indented `label: value` rows underneath — a nested list, one
 * item with several facts of its own, the way a search query has both a
 * click count and a position.
 */
const groupItem = (it: Item, index: number, numbered: boolean): string => {
  const linked = it.url ? `<a href="${esc(it.url)}">${esc(it.text)}</a>` : esc(it.text);
  const head = it.label
    ? `<b>${esc(cap(it.label))}:</b> ${linked}`
    : numbered
      ? `${index + 1}. ${linked}`
      : `• ${linked}`;

  if (!it.facts || it.facts.length === 0) {
    return head;
  }

  const sub = it.facts
    .filter(([, value]) => !isZeroStill(value))
    .map(([label, value]) => `   <b>${esc(cap(label))}:</b> ${esc(String(value))}`);

  return [head, ...sub].join('\n');
};

/**
 * A zero that did not move says nothing. On game-publisher six of the eight
 * analytics rows read `0 / 0 =` every single day, and the liveness check
 * printed six rows of `0` nine days running (25.08–03.09.2026). The owner:
 * silence is the report. So a row whose value is a bare `0`, or a zero
 * compared with a zero, is not printed — and a group left with no rows loses
 * its heading too. A zero that CHANGED (`0 / 3 ▼3`) still prints: that is news.
 */
const isZeroStill = (value: string | number): boolean =>
  /^\s*0(?:[.,]0+)?\s*%?\s*(?:\/\s*0(?:[.,]0+)?\s*%?\s*=?\s*)?$/.test(String(value));

// A long explanation (a note, incident details) — as a quote: in Telegram
// that is a bar on the left and a light indent, reading as "details," not as
// part of the heading. Longer than ~400 characters and the quote collapses
// on its own (`expandable`, Bot API), otherwise a stack trace or a log dump
// stretches the card across the whole screen.
// A quote collapses when it would take more than a screenful — by length OR
// by line count, because five short lines eat as much screen as one long
// paragraph and the old length-only rule let them through (v2.1).
const EXPAND_AT = 400;
const EXPAND_LINES = 5;
/** The quote itself, over text that is ALREADY safe HTML. */
const quoteHtml = (body: string): string => {
  const long = body.length > EXPAND_AT || body.split('\n').length > EXPAND_LINES;

  return long ? `<blockquote expandable>${body}</blockquote>` : `<blockquote>${body}</blockquote>`;
};
const note = (text: string | undefined): string | null => (text ? quoteHtml(esc(text)) : null);

/**
 * GitHub Markdown, read in Telegram. A PR or issue body arrives as the author
 * wrote it for GitHub, and Telegram knows none of it: `## Как проверял` stood
 * as two hash signs, a screenshot as `![after 375](https://…png)` in full, the
 * PR template's HTML comment as a paragraph, a table as a fence of bars. On
 * the 49 PR and issue cards of the week of 25.08.2026 that was the "wall of
 * text" the owner read. So the body is translated, not pasted (03.09.2026):
 *
 *   - a comment `<!-- … -->` is the template talking to the author — dropped;
 *   - `## Heading` → bold line; `**x**` → bold; `` `x` `` → code; a fenced
 *     block → `<pre>`;
 *   - an image `![alt](https://…)` → a link named by its alt (or `image`);
 *     a link `[text](https://…)` → a link; a link to a repo path (no scheme)
 *     keeps only its text — the address would not open from a phone anyway;
 *   - a table: the `|---|` rule is dropped, a row's cells are joined by ` · `;
 *   - `Closes #N` / `Fixes #N` lines are GitHub's own bookkeeping — dropped;
 *   - runs of blank lines collapse to one.
 *
 * Everything is escaped FIRST, then the markup is added on the escaped text:
 * the patterns contain no `<>&"`, so nothing the author typed can become a tag.
 */
export const markdownToTelegram = (text: string): string => {
  const stripped = text.replace(/<!--[\s\S]*?-->/g, '');
  const out: string[] = [];
  let fence: string[] | null = null;

  for (const raw of stripped.split('\n')) {
    const line = esc(raw);

    if (/^\s*```/.test(line)) {
      if (fence) {
        out.push(`<pre>${fence.join('\n')}</pre>`);
        fence = null;
      } else {
        fence = [];
      }
      continue;
    }
    if (fence) {
      fence.push(line);
      continue;
    }
    if (/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line)) {
      continue; // a table's header rule
    }
    if (/^\s*(closes|fixes|resolves)\s+#\d+\s*$/i.test(line)) {
      continue;
    }

    let row = line;
    const heading = row.match(/^\s*#{1,6}\s+(.*?)\s*#*\s*$/);
    if (heading) {
      row = `<b>${heading[1]}</b>`;
    } else if (/^\s*\|.*\|\s*$/.test(row)) {
      row = row
        .trim()
        .slice(1, -1)
        .split('|')
        .map((c) => c.trim())
        .filter((c) => c !== '')
        .join(' · ');
    }
    // Each replace used to run over the OUTPUT of the previous one, so a tag
    // this function had just written was still visible to the next pattern.
    // Two shapes came out illegal for Telegram, and Telegram answers 4xx to
    // both — the package does not retry a 4xx, so the whole card is lost:
    //   `[![alt](img)](url)` — the README badge — became `<a><a>…</a></a>`,
    //   `` `a **b** c` ``   became `<code>a <b>b</b> c</code>`.
    // A produced tag is therefore parked in `spans` behind a sentinel that no
    // pattern below can match, and put back only after the last replace.
    // `plain` unwraps a parked span to its text, which is how a link label
    // that already holds a link (or code) is flattened instead of nested.
    const spans: string[] = [];
    const park = (html: string): string => `\u0000${spans.push(html) - 1}\u0000`;
    const plain = (s: string): string =>
      s.replace(/\u0000(\d+)\u0000/g, (_, i: string) => spans[Number(i)].replace(/<[^>]+>/g, ''));
    const bold = (s: string): string => s.replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>');
    row = row
      // Code first: nothing inside a `code` span may become a tag.
      .replace(/`([^`\n]+)`/g, (_, code: string) => park(`<code>${code}</code>`))
      .replace(/!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g, (_, alt: string, url: string) =>
        park(`<a href="${url}">${plain(alt).trim() || 'image'}</a>`))
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, label: string, url: string) =>
        park(`<a href="${url}">${bold(plain(label)).trim() || 'link'}</a>`))
      .replace(/\[([^\]]+)\]\([^)]*\)/g, (_, label: string) => plain(label))
      .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
      .replace(/\u0000(\d+)\u0000/g, (_, i: string) => spans[Number(i)]);
    out.push(row);
  }
  if (fence) {
    out.push(`<pre>${fence.join('\n')}</pre>`);
  }

  return out
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

/**
 * The first section of a Markdown body: everything up to the SECOND `## `
 * heading. On a merged or closed card the body is text he has already read
 * when the thing was opened; the section that says what changed for the user
 * is enough, the rest is one tap away behind the number.
 */
const firstSection = (text: string): string => {
  const lines = text.replace(/<!--[\s\S]*?-->/g, '').split('\n');
  // The cut is made at the next heading of the FIRST heading's level, not at
  // any heading at all. `#{1,6}` treated a `###` subsection inside the first
  // section as the second heading, so everything after it was silently
  // dropped from a merged PR or a closed issue — the body the card exists to
  // carry. A deeper heading belongs to the section it sits in and is kept.
  let level = 0;
  const kept: string[] = [];
  for (const line of lines) {
    const m = line.match(/^\s*(#{1,6})\s+/);
    if (m) {
      if (level === 0) {
        level = m[1].length;
      } else if (m[1].length <= level) {
        break;
      }
    }
    kept.push(line);
  }

  return kept.join('\n');
};

/** A quoted Markdown body — translated, and optionally cut to its first section. */
const markdownQuote = (body: string | undefined, whole: boolean): string | null => {
  if (!body) {
    return null;
  }
  const html = markdownToTelegram(whole ? body : firstSection(body));

  return html ? quoteHtml(html) : null;
};

/**
 * A quote with a caption. A bare quote reads as a continuation of the
 * field above it: the owner asked about the line that opens a session,
 * "what does this text mean, where does it come from" — and he was right,
 * the card says it nowhere. The caption stands on its own line, because
 * the text itself does not fit in a field: a field holds one line and cuts
 * it.
 *
 * The caption is a bold field label with nothing after the colon, not the
 * group() heading (italic-underline). It was the group heading first, and
 * the owner read that and said it did not look like a category — correctly:
 * a group is a heading over a LIST, and this caption sits over one quote,
 * never more than one. A bold label with no value on the line is the same
 * shape `Title:` already has right before a PR's body — the reader has
 * already seen this exact pattern mean "what follows is quoted text."
 */
const quoted = (label: string, text: string | undefined): string | null =>
  text ? `<b>${esc(cap(label))}:</b>\n${note(text)}` : null;

/**
 * Assembles the card. A blank line here marks a block change, not
 * indentation: two in a row mean an empty block, a leading one means a
 * block that does not exist. Both appear when some fields did not arrive,
 * and both collapse here, not separately in every renderer.
 */
const join = (parts: Array<string | null>): string => {
  const out: string[] = [];
  for (const part of parts) {
    if (part === null) {
      continue;
    }
    if (part === '' && (out.length === 0 || out[out.length - 1] === '')) {
      continue;
    }
    out.push(part);
  }
  while (out.length > 0 && out[out.length - 1] === '') {
    out.pop();
  }

  return out.join('\n');
};

/** A flat list of items (no labels) — job/report with no groups. */
/**
 * List items. A named group ALWAYS prints its heading — the same law
 * `labelled` follows: a card of one type must not look different on
 * different days. Numbering runs within the block, not across it: "1, 2"
 * under its own heading reads fine, a running "3, 4" under the second one
 * does not.
 */
const bullets = (items: Item[] | undefined, numbered: boolean): string[] => {
  const list = items ?? [];
  const names = [...new Set(list.map((it) => it.group).filter((g): g is string => !!g))];

  if (names.length === 0) {
    return list.map((it, i) => groupItem(it, i, numbered));
  }

  const out: string[] = [];
  list.filter((it) => !it.group).forEach((it, i) => out.push(groupItem(it, i, numbered)));

  for (const name of names) {
    out.push('');
    out.push(group(name));
    list.filter((it) => it.group === name).forEach((it, i) => out.push(groupItem(it, i, numbered)));
  }

  return out;
};

/** A whole named group: heading + items, separated by a blank line inside the call, via join. */
const renderGroup = (g: { name: string; items: Item[] }): string[] => [
  group(g.name),
  ...g.items.map((it, i) => groupItem(it, i, false))
];

/**
 * ONE rule for every card that has both a title and a body: the title is
 * an ordinary `Title:` field, the body is a quote, and the quote holds
 * nothing else.
 *
 * The title used to sit INSIDE THE QUOTE together with the body, separated
 * by a blank line. The owner found the problem with that: the title is the
 * main thing on a card, WHAT it is about, and it sat there as gray text of
 * the same weight as the description — the only way to tell them apart was
 * the blank line. On a PR with no body, the card degenerated into a single
 * lonely gray one-line quote.
 *
 * The title is cut to its first line: a multi-line commit subject must not
 * drag its own body into the field.
 */
/**
 * The commit is one row, the way a task and a pull request are one row: the
 * hash carries the link, the subject stands next to it. It used to take two —
 * `Commit: a1b2c3d` and `Title: feat: new landing` underneath — and `Title:`
 * was the same row the issue card had already lost for the same reason: you
 * could not read what the card was about without reading two lines.
 */
const commitRow = (
  hash: string | undefined,
  url: string | undefined,
  title: string | undefined
): string | null => {
  // The hash IS the link, and the title stands beside it: `Commit: <a>9b1fc68</a>
  // · feat: …`. The hash spent two days (31.08–03.09.2026) as plain text in the
  // middle of the card with its link parked in a `Source:` row at the bottom,
  // where the same hash was printed a second time. The owner: "хэш можно
  // сделать кликабельным" — a pointer is clickable where it stands, and the
  // separate row that repeated it is gone.
  if (!hash && !title) {
    return null;
  }
  const head = hash ? (url ? `<a href="${esc(firstLine(url))}">${esc(firstLine(hash))}</a>` : esc(firstLine(hash))) : '';
  const name = title ? esc(firstLine(title)) : '';
  const value = head && name ? `${head} · ${name}` : head || name;

  return `<b>Commit:</b> ${value}`;
};

const bodyQuote = (body: string | undefined): string | null =>
  body ? markdownQuote(body, true) : null;

/**
 * Labelled rows, sorted into the groups the sender itself named.
 *
 * The rule is simple and enforced by code: named a group — the heading
 * prints. Always, no matter how many rows are in it or how many groups
 * turn up. I tried a "two or more" threshold and dropped it: on the backup
 * card all the numbers sit in one group, with a summary of the run above
 * them, and the threshold was killing exactly the seam the owner asked
 * for in the first place.
 *
 * This also removes the risk of "the same card looks different on
 * different days": the look depends on what the sender NAMED in code, not
 * on how many rows happened to show up today.
 *
 * Group order is the order the sender first mentions them: it knows what
 * matters more. Unnamed rows come first with no heading — they are facts
 * about the card itself, not about any one of its subjects.
 */
const labelled = (rows: Array<[string, string | number, string?]> | undefined): string[] => {
  const list = (rows ?? []).filter(([, value]) => !isZeroStill(value));
  const names = [...new Set(list.map(([, , g]) => g).filter((g): g is string => !!g))];

  if (names.length === 0) {
    return list.map(([label, value]) => field(label, value)).filter((l): l is string => l !== null);
  }

  const out: string[] = [];
  const bare = list.filter(([, , g]) => !g);
  for (const [label, value] of bare) {
    const line = field(label, value);
    if (line !== null) {
      out.push(line);
    }
  }
  for (const name of names) {
    // A blank line before EVERY heading, including the first: above it there
    // are always the card's own fields (Task, Period), and without the seam
    // the heading read as just another one of them. No need to worry about
    // double blanks — `join` collapses them.
    out.push('');
    out.push(group(name));
    for (const [label, value] of list.filter(([, , g]) => g === name)) {
      const line = field(label, value);
      if (line !== null) {
        out.push(line);
      }
    }
  }

  return out;
};

/**
 * Blocks owned by the renderer itself — a deploy and a check have two of
 * them, and they are about different things: `Run` is the run itself and
 * its circumstances, `Change` is the change that caused it. The owner on a
 * CI card: "commit, actor, workflow — I don't know, it's all a jumble."
 *
 * The heading prints for EVERY non-empty block, not only when there are
 * two. It used to be "two or more," to save a line on a green card, and
 * that turned out to be a mistake: a green deploy has no target and no
 * reason, there is only one block, the headings disappeared — and the same
 * kind of notification looked different from one day to the next. The
 * owner asked twice "why isn't there a group here," looking straight at a
 * green one. A heading row costs less than having to hunt for what is what
 * every single time.
 */
/**
 * A deploy or a check has two subjects: the run itself and the commit it went
 * out with. Facts about the RUN touch the type line with no heading, because
 * the type line already names the run — that is how every job card is built,
 * and `Reason:` must not sit against the name on one card and under a heading
 * on another. Facts about the COMMIT are a different subject, so they keep a
 * heading of their own.
 *
 * The `Run` heading is gone for the same reason the word `open` went: it
 * announced what line 2 had already said.
 */
const twoBlocks = (run: Array<string | null>, change: Array<string | null>): Array<string | null> => {
  const live = (rows: Array<string | null>): string[] => rows.filter((r): r is string => r !== null && r !== '');
  const runRows = live(run);
  const changeRows = live(change);

  return [...runRows, ...(changeRows.length > 0 ? ['', group('Change'), ...changeRows] : [])];
};

type Renderer<E extends NotifyEvent> = (e: E) => string;

// The icon and its rule live in events.ts: the sound depends on it too.

/** Line 2: the icon sits outside the bold, `<b>Type:</b> action` — the same field, not a special case. */
// `action` is typed as a string, but it also arrives from `--json` and from
// direct calls in JS, where there are no types. An empty or missing value
// produced the row `ℹ️ null` right on the card's second line. An empty string
// is more honest: the field simply disappears.
// A link belongs on the NAME of the thing it opens, never on a separate row
// whose only text is the verb `open`. The owner read `Details: open` under a
// report and asked what "open" was — the answer is the report itself, which was
// sitting three lines above as dead text. So line 2 takes an optional URL and
// the action text becomes the link: `Report: <a>Analytics for 12.08</a>`.
// `aside` is the one qualifier an identifier needs to be readable on its own —
// which day a report covers, which day its arrows are measured against. It
// rides in brackets ON the type line instead of taking a row of its own,
// because a row of its own reads as another fact about the subject rather than
// as part of the name.
const typeLine = (
  icon: string,
  type: string,
  action: string | undefined,
  url?: string,
  aside?: string
): string => {
  // `field` returns null on an empty value, and interpolating null into a
  // template prints the word "null". That is how line 2 of a card became
  // `ℹ️ null` — reachable through `--json` and through a direct call from JS,
  // where there are no types.
  const tail = aside ? ` (${esc(aside)})` : '';
  const name = action?.trim();

  // No name: the card must not invent one. It used to write the word `open`
  // into the identifier slot, so a report with a link and no title arrived as
  // `Report: open` — and a deploy with neither fell back to its own status
  // word, `Deploy: fail`, saying the outcome a third time after the icon and
  // the tag. Both are the same mistake: a slot that must hold a name holding
  // something else instead. The type word itself takes the link, so nothing
  // clickable is lost and nothing false is said.
  if (!name) {
    const bare = `<b>${esc(cap(type))}</b>`;
    return `${icon} ${url ? `<a href="${esc(url)}">${bare}</a>` : bare}${tail}`;
  }

  const line = url ? fieldLink(type, url, name) : field(type, name);

  return line === null ? `${icon} <b>${esc(cap(type))}</b>${tail}` : `${icon} ${line}${tail}`;
};

// `workflowUrl ?? url`: half the senders send the run link under the name
// `--url` — that name was in the package before and stayed in their calls.
// The renderer only read `workflowUrl`, so a red card arrived WITH NOT A
// SINGLE LINK to the logs. Rejecting `--url` would be more honest by name and
// worse in practice: the intent is unambiguous, and a card with no link is
// useless exactly when it is needed most.
/**
 * What to call the thing that ran. The workflow's own name first — it is the
 * only text here that identifies THIS run. Then the caller's own word for the
 * mechanism (`manual, from the Mac`). No third fallback: a row that says
 * nothing distinctive is worse than not printing a name at all, and
 * `typeLine` already handles the case with no name — a bare `<b>Deploy</b>`,
 * still linked when a run URL exists.
 */
const mechanism = (workflowName: string | undefined, via: string | undefined): string | undefined =>
  workflowName ?? via;

// The name of what ran sits WITH the type line, not eight lines below it.
// `Deploy: fail` and `by what means it ran` answer one question, and the owner
// read the two rows as unrelated things. It used to be one fact split in two:
// `Via: GitHub Actions` in the middle of the card and a trailing
// `Workflow: <run>` in the actions block. On one-q that trailing row rendered
// `Workflow: Deploy` — the link text repeating the word on line 2 and naming
// nothing.
//
// The link text is the workflow's OWN name, never the platform: `GitHub
// Actions` is identical on every card in every repository, so clicking it told
// the owner nothing about where he was going. `manual, from the Mac` stays
// unlinked, because a hand deploy has no run to open.
const renderDeploy: Renderer<Extract<NotifyEvent, { type: 'deploy' }>> = (e) => {
  const icon = iconFor(e);

  return join([
    // The name of what shipped the deploy sits on the type line, the outcome
    // in parens beside it — icon and tag alone were judged, live, not to be
    // enough: a plain 🔴 next to a workflow name still read as "something
    // happened," not "it failed," on a screen small enough to lose the color.
    // The `Via` row is gone: it used to carry this same name one floor below.
    // The run URL rides on the name (03.09.2026): the thing you read is the
    // thing you tap. It spent three days in a `Source:` row at the bottom, and
    // the owner asked what that row was for when the name was right there.
    typeLine(icon, 'Deploy', mechanism(e.workflowName, e.via), sourceUrl(e), e.status === 'fail' ? 'Fail' : 'OK'),
    ...twoBlocks(
      [field('Target', e.target), reason('Reason', e.note), field('Still red', e.stillRed ? `day ${e.stillRed}` : null)],
      [
        commitRow(e.commit, e.commitUrl, e.commitTitle),
        fieldPerson('Author', e.commitAuthor),
        bodyQuote(e.commitBody)
      ]
    )
  ]);
};

const schedule = (
  expected: string | undefined,
  lastSeen: string | undefined,
  lastLabel: string
): Array<string | null> => {
  const rows = [field('Expected', expected), field(lastLabel, lastSeen)].filter(
    (r): r is string => r !== null
  );

  return rows.length > 0 ? ['', group('Schedule'), ...rows] : [];
};

const renderJob: Renderer<Extract<NotifyEvent, { type: 'job' }>> = (e) => {
  const icon = iconFor(e);
  const hasItems = (e.items ?? []).length > 0;
  const disabledList = hasItems && e.status === 'disabled';

  // The NAME goes on the type line, the way `Report:` and `Issue:` carry
  // theirs. It used to sit a line below under a second label, `Task:`, and
  // the owner asked what a task is doing on a card headed Job — nothing: they
  // were two words for one thing, and the outcome that took the first line is
  // already the icon, and now the third tag too.
  //
  // There is no `State:` row. It said "switched off, not broken" under a 🚫
  // and "no word from it at all" under a ❓ — the third way of saying what the
  // icon says and what the third tag now says too. The icon table on the
  // catalogue page defines both marks.

  return join([
    // The URL is on the name (03.09.2026). It went down to a `Source:` row in
    // v2.1 so the pointer could be SEEN — and came back, because the row's
    // only text was `workflow run`, the same two words on every card.
    typeLine(icon, 'Job', e.job, sourceUrl(e), e.aside),
    reason('Reason', e.note),
    field('Still red', e.stillRed ? `day ${e.stillRed}` : null),
    // The timetable is a different subject from this event: how often the task
    // owes a sign of life and when it last gave one. It stood in a bare run
    // under `Reason:` and read as more of the same. `Last run` when the task
    // is alive, `Last seen` when it is not — one timestamp, two questions.
    ...schedule(e.expected, e.lastSeen, e.status === 'silent' ? 'Last seen' : 'Last run'),
    ...labelled(e.stats),
    e.detail ? '' : null,
    quoted(e.detailLabel ?? 'Detail', e.detail),
    hasItems ? '' : null,
    // Heading ONLY for `disabled`. It used to print for any job carrying a
    // list, so playhub's daily card of newly published games was headed
    // "Disabled workflows".
    disabledList ? group('Disabled workflows') : null,
    ...(hasItems ? bullets(e.items, disabledList) : []),
    e.command ? '' : null,
    ...fieldRun(e.command, e.commandNote)
    // `Log:` left this body for the pointer block that `render` appends to
    // every card — the block a cut can never take.
  ]);
};

const renderReport: Renderer<Extract<NotifyEvent, { type: 'report' }>> = (e) => {
  if (e.groups && e.groups.length > 0) {
    const body = e.groups.flatMap((g, i) => (i === 0 ? renderGroup(g) : ['', ...renderGroup(g)]));

    // `lines` AND `groups` together, not one or the other: the branch with
    // groups used to print ONLY the groups, and the report's numbers vanished
    // without a word.
    const numbers = labelled(e.lines);

    return join([
      typeLine(iconFor(e), 'Report', e.title, e.url, e.aside),
      // Rows with no group of their own sit flush against the header instead of
      // forming a separate slab under a blank line. `labelled` puts the blank
      // line before the first group itself, so there is none here.
      ...numbers,
      body.length > 0 ? '' : null,
      ...body
    ]);
  }

  const items = bullets(e.items, false);

  return join([
    // The day's snapshot link is on the title — `Source: report` under a card
    // headed Report named nothing.
    typeLine(iconFor(e), 'Report', e.title, e.url, e.aside),
    // Flush against the header — see the branch above.
    ...labelled(e.lines),
    items.length > 0 ? '' : null,
    ...items
  ]);
};

// Same law as the deploy card: what ran joins the type line itself and
// carries the link to its run — `CI: nightly`, not a separate `Check:`/`Via:`
// row. There is no separate label here at all: on deploy the mechanism
// answers by what means the code was shipped, on CI it answers WHICH gate
// spoke (`nightly`, `Quality`) — but both are the name on the type line.
const renderCi: Renderer<Extract<NotifyEvent, { type: 'ci' }>> = (e) => {
  const icon = iconFor(e);

  return join([
    // The run URL is on the gate's name — `CI: <a>nightly</a>` — since 03.09.2026.
    typeLine(icon, 'CI', mechanism(e.workflowName, undefined), sourceUrl(e), e.status === 'fail' ? 'Fail' : 'OK'),
    // `Actor` used to be read as "who wrote the commit," and on most runs it
    // is — `github.actor` for a push IS the person who pushed. It stops being
    // that on a scheduled run: arvent's nightly rewrites it to whoever is on
    // duty to fix a red run, which can be someone other than the commit's
    // author. So Actor answers "who is responsible for this run," `Author`
    // below the commit answers "who wrote this code" — two different people
    // on a nightly card, the same person everywhere else.
    ...twoBlocks(
      [reason('Reason', e.note), field('Still red', e.stillRed ? `day ${e.stillRed}` : null)],
      [
        fieldTelegram('Actor', e.actor),
        commitRow(e.commit, e.commitUrl, e.commitTitle),
        fieldPerson('Author', e.commitAuthor),
        bodyQuote(e.commitBody)
      ]
    )
  ]);
};

// A pull request and an issue are identified the way GitHub itself identifies
// them: `#118 <title>`, one string, and it is the link. It used to take three
// rows — the action on line 2, `Number:` under it, `Title:` under that — so
// the thing the card is about could not be read without reading three lines.
// The action is not repeated in words: the icon carries it, and no two actions
// of one type share an icon.
// The number left line 2 on 31.08.2026, by the same rule that moved the commit
// hash the same day: `#347` is a pointer, and every pointer lives in the last
// block. Line 2 keeps the title, which is what the thing IS; the number comes
// back as the text of the `Source` link, where it names exactly what opens.
//
// With no title there is nothing left to say, so line 2 falls back to the bare
// type word — `typeLine` already does that on an empty name. The number is not
// put back here: it would then appear twice on a titled card and once on an
// untitled one, which is the inconsistency this move exists to remove.
//
// With NO url the number stays put, because then the `Source` row does not
// exist and dropping it here would erase the number from everything a person
// reads — the card would name a task without saying which. Same law as
// `fieldLink`: an identifier must not vanish just because the caller passed no
// address for it.
/**
 * Line 2 of a pull request or an issue, since 03.09.2026:
 *
 *   🎉 <b>PR</b> <a>#414</a> · title
 *
 * The number is the link and it stands FIRST, right after the type word; the
 * title follows a middle dot. The owner asked for exactly this: "номер
 * перенести в title и сделать кликабельным … и разделить их как-то с
 * title". The number had spent three days at the bottom as `Source: #414`,
 * twenty lines under a title that could not be tapped. With no url the number
 * still prints, plain. With no title the line ends at the number.
 */
const numberedLine = (
  icon: string,
  type: string,
  number: number,
  title: string | undefined,
  url: string | undefined
): string => {
  const id = url ? `<a href="${esc(firstLine(url))}">#${number}</a>` : `#${number}`;
  const name = title?.trim() ? ` · ${esc(firstLine(title.trim()))}` : '';

  return `${icon} <b>${esc(type)}</b> ${id}${name}`;
};

// The people come BEFORE the text, and the text comes only when it is the
// news. An `assigned` card carries one new fact — who took it — and it used to
// sit dead last, under the issue's entire description: the owner read a card
// about someone taking issue #312 and asked who, because he never got that far.
//
// The description is the news exactly once, when the thing is opened. On
// assigned, closed or merged it is text he has already read, and it buries
// the one line he came for.
//
// A review verdict is the one exception: on `approved`/`changes_requested`
// `body` is not the PR's description any more — the sender puts the
// REVIEWER'S OWN comment there, which is new text he has not seen. "Verdict:
// changes_requested, then nothing" was the owner's complaint: a verdict with
// no comment attached said less than the review itself did.
// Same rule as the issue card since 31.08.2026: the body prints on every
// action, collapsed when long. `VERDICT` stays because it changes what the
// body MEANS — on approved/changes_requested the sender puts the reviewer's
// own comment there, not the PR description — and that is what the caption
// has to say.
const VERDICT: ReadonlySet<string> = new Set(['approved', 'changes_requested']);
// The whole body is news exactly once — when the thing is opened, or when the
// text is a reviewer's own comment. On merged and closed the card keeps the
// first section only (what changed for the user); the rest is one tap away
// behind the number. Every body is Markdown from GitHub and is translated.
const prBody = (action: string, body: string | undefined): string | null => {
  if (VERDICT.has(action)) {
    const html = markdownQuote(body, true);
    return html ? `<b>Review:</b>\n${html}` : null;
  }

  return markdownQuote(body, action === 'opened');
};

// The body is what the title stands for — it sits directly under the name,
// with nothing between them. The people come after, consolidated in one
// place, never splitting the title from what it names: the owner on the
// old order, title then Author then Assignee then finally the body — "why
// does the assignee cut apart what should be inseparable?"
const renderPr: Renderer<Extract<NotifyEvent, { type: 'pr' }>> = (e) =>
  join([
    numberedLine(iconFor(e), 'PR', e.number, e.title, e.url),
    prBody(e.action, e.body),
    e.body ? '' : null,
    fieldPerson('Author', e.author),
    fieldPerson('Reviewer', e.reviewer)
  ]);

// The body prints on EVERY action, as a quote that collapses when it is
// long. The owner settled this on 31.08.2026, after the short assigned card
// shipped: "если это ишью, то видеть тело ишью… везде, где это может быть
// полезно, не переходя по ссылке на источник." A collapsed quote costs four
// lines, which is what the earlier "he already saw it" reasoning was trying
// to save — the expandable quote buys the context back without the cost.
// Whole on opened and assigned (the text is still the news, or the person who
// took it needs the whole brief); the first section on closed — see prBody.
const renderIssue: Renderer<Extract<NotifyEvent, { type: 'issue' }>> = (e) =>
  join([
    numberedLine(iconFor(e), 'Issue', e.number, e.title, e.url),
    markdownQuote(e.body, e.action !== 'closed'),
    e.body ? '' : null,
    fieldPerson('Author', e.author),
    fieldPerson('Assignee', e.assignee)
  ]);

// The incident's own title IS line 2, exactly as an issue's is. It used to say
// the word `open` there — which the 🚨 already says, and no other card repeats
// its icon in words — with the real title one row below under a `Title:` label.
//
// `detail` is a diagnosis of several lines (vault greps three of them plus a
// log path). It used to go through `field`, which keeps only the first line, so
// every alarm this package ever sent arrived gutted. It is quoted now, the same
// shape a commit body takes.
const renderIncident: Renderer<Extract<NotifyEvent, { type: 'incident' }>> = (e) => {
  const findings = bullets(e.items, false);

  return join([
    typeLine(iconFor(e), 'Incident', e.title, e.url),
    e.detail && e.detail !== e.title ? note(e.detail) : null,
    field('Still red', e.stillRed ? `day ${e.stillRed}` : null),
    findings.length > 0 ? '' : null,
    ...findings
    // `Log:` moved to the pointer block `render` appends — see renderJob.
  ]);
};

// A session in trouble. Same law as every other card: identifier first, then
// the facts as fields, then his own words as a quote — never as a field, which
// keeps one line and clipped the name of the very session the card is about.
//
// A session has no name, so line 2 says what happened to it. The 36-character
// id is not printed: he cannot type it, cannot search it and cannot act on it.
// It is still in the card — inside the `rm` command at the bottom, which is the
// one place it is of any use.
const renderSession: Renderer<Extract<NotifyEvent, { type: 'session' }>> = (e) =>
  join([
    typeLine(iconFor(e), 'Session', e.action),
    // No blank line under the type line: a blank means a new block, and here it
    // opened a block that had no heading. Facts about the session touch the
    // line that names it, the way they do on every job card.
    field('Project', e.workdir),
    reason('Reason', e.reason),
    field('Still red', e.stillRed ? `day ${e.stillRed}` : null),
    e.opened ? '' : null,
    quoted('Opened with', e.opened),
    e.command ? '' : null,
    ...fieldRun(e.command, e.commandNote)
  ]);

const renderHeartbeatMiss: Renderer<Extract<NotifyEvent, { type: 'heartbeat_miss' }>> = (e) => {
  const icon = iconFor(e);

  return join([
    // The task's name on the type line, exactly as a job card carries it. The
    // `Task:` row said the same thing a floor below. No sender in any
    // repository builds this event any more — the silence watchdog sends an
    // ordinary job with `--status silent` — but a machine still running the old
    // copy of that watchdog can, and the card it gets must obey the template.
    // No bracket saying `ok` or `miss`: the icon says it, the third tag says
    // it, and `miss` is not one of the five words the outcome is allowed to
    // be. The bracket is for what finishes the NAME, never for a verdict.
    typeLine(icon, 'Heartbeat', e.job),
    field('Reason', e.note),
    ...schedule(e.expected, e.lastSeen, e.recovered ? 'Last run' : 'Last seen')
  ]);
};

const RENDERERS: { [K in NotifyEvent['type']]: Renderer<Extract<NotifyEvent, { type: K }>> } = {
  deploy: renderDeploy,
  job: renderJob,
  report: renderReport,
  ci: renderCi,
  pr: renderPr,
  issue: renderIssue,
  incident: renderIncident,
  session: renderSession,
  heartbeat_miss: renderHeartbeatMiss
};

// The tag at the top of the card AND the parser's machine key are ONE AND THE
// SAME value (the owner's decision, 20.08.2026): they used to be two separate
// representations of one fact (a hyphenated `#ci-arvent` at the bottom, tags
// typed by hand at the top), and that read as duplication. The separator is
// an underscore, not a hyphen: a hyphen splits a Telegram hashtag in the
// middle of a word (`#mac-config` links only as `#mac`), and the tag MUST be
// clickable — that is exactly the "show this instance's whole history" filter
// the owner uses in practice.
export const slug = (raw: string): string =>
  raw
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);

// The type tag at the top is not the literal `e.type`: `heartbeat_miss` would
// read as `#heartbeat_miss`, while the type the owner sees is always just
// `#heartbeat` (a green and a red card of one kind carry the same type tag).
const TYPE_TAG: Record<NotifyEvent['type'], string> = {
  deploy: 'deploy',
  job: 'job',
  report: 'report',
  ci: 'ci',
  pr: 'pr',
  issue: 'issue',
  incident: 'incident',
  session: 'session',
  heartbeat_miss: 'heartbeat'
};

/**
 * The instance tag: exactly which concrete event this is (branch,
 * environment, task, number) — the parser uses it to match a 🔴 against a
 * later green card of the SAME instance. An explicit `key` always wins;
 * without one, it is derived from the type's most stable fields (branch/
 * environment outrank the title, because a recurring task's title does not
 * change, while for a report the title is exactly the one stable field it
 * has).
 */
export const eventKey = (e: NotifyEvent): string => {
  const fallback = (): string => {
    switch (e.type) {
      case 'ci':
        return slug(e.branch || e.project);
      case 'deploy':
        return slug(e.target || e.project);
      case 'job':
      case 'heartbeat_miss':
        return slug(e.job);
      case 'report':
      case 'incident':
        return slug(e.title);
      // NOT the session id: an id is unique per session, so the tag would be
      // new every time and nothing could ever be paired with anything.
      case 'session':
        return slug(e.action);
      case 'pr':
        return `p${e.number}`;
      case 'issue':
        return `i${e.number}`;
    }
  };

  // An empty instance tag (`#session # #fail`) is not a tag: it groups
  // nothing and the parser cannot pair a red card with its green one. An
  // untyped `--json` payload can leave every field it is derived from blank,
  // so the project name is the last resort.
  return (e.key ? slug(e.key) : fallback()) || slug(e.project) || 'event';
};

/**
 * The third tag is the OUTCOME, and it is always there. The owner: "I'm
 * missing a fail tag or something like it, so failures can be grouped and
 * ok can be grouped." One tap in Telegram collects every failure of a
 * project at once, no matter what type it arrived as — a deploy, a check,
 * a scheduled task, an incident.
 *
 * The value comes from the ICON, never from the status word. The icon is
 * already the single source of truth for the sound, and a second list of "what
 * counts as broken" would drift from the first — it already did once, when a
 * red card arrived silent.
 *
 * One icon meaning, one tag. A watchdog that SWITCHED SOMETHING OFF is not a
 * failure and must not be filed under the same word as one: the owner read
 * `#fail` under a 🚫 and said so. Nor is a task that has simply gone quiet —
 * nobody knows yet whether it broke, and `#unknown` is the honest word for it.
 */
/** Every icon the package can print — the key space of the outcome table. */
type Icon = (typeof ICON)[keyof typeof ICON];

/** The five words the third tag is allowed to be, and there is no sixth. */
type OutcomeTag = 'ok' | 'fail' | 'off' | 'unknown' | 'info';

/**
 * The type is `Record` over EVERY icon, not over `string`. A new icon added to
 * `ICON` without a word here now fails to compile. Under the old loose type it
 * fell through a `?? 'info'` default instead: a card whose outcome nobody had
 * decided was indistinguishable from a card that is genuinely just news, and
 * nothing anywhere went red. `info` is therefore written out for each icon
 * that means it, never left to a fallback.
 */
export const OUTCOME_TAG: Readonly<Record<Icon, OutcomeTag>> = {
  [ICON.red]: 'fail',
  [ICON.alarm]: 'fail',
  [ICON.off]: 'off',
  [ICON.unknown]: 'unknown',
  [ICON.ok]: 'ok',
  [ICON.landed]: 'ok',
  [ICON.approved]: 'ok',
  // Something happened; no verdict was passed on it. The word is `info`, not
  // `news`: the icon on every one of these cards is ℹ️, and the owner read
  // `#news` under it and asked what news meant. One thing wore two words.
  [ICON.fresh]: 'info',
  [ICON.taken]: 'info',
  [ICON.discarded]: 'info',
  [ICON.changes]: 'info',
  [ICON.info]: 'info'
};

export const outcomeTag = (e: NotifyEvent): OutcomeTag => OUTCOME_TAG[iconFor(e) as Icon];

const tagsLine = (e: NotifyEvent): string =>
  `#${TYPE_TAG[e.type]} #${esc(eventKey(e))} #${outcomeTag(e)}`;


/**
 * Rule S (v2.1, amended 03.09.2026): the card says where to verify it. A
 * link rides on the NAME of the thing on line 2 (the run, the report, the
 * number of a PR or an issue) and on the commit hash; the last block keeps
 * only what is not a link — `Check:` is a local command, `Log:` is a path,
 * and a path cannot be tapped, only copied.
 *
 * The `Source:` row that held the links from 31.08 to 03.09 is gone: its text
 * was `workflow run` on every deploy, `report` under every report, and a
 * number twenty lines below the title it belonged to. The owner: "Зачем это
 * всё? … Если ссылка подразумевается, она должна лежать сразу в title."
 */
const sourceUrl = (e: NotifyEvent): string | undefined => {
  const wf = 'workflowUrl' in e ? e.workflowUrl : undefined;
  const url = 'url' in e ? e.url : undefined;

  return wf ?? url;
};

const pointerBlock = (e: NotifyEvent): string => {
  const logs = 'logs' in e ? e.logs : undefined;
  const rows = [fieldCode('Log', logs), fieldCode('Check', e.check)].filter((r): r is string => r !== null);

  return rows.length > 0 ? `\n\n${rows.join('\n')}` : '';
};

/**
 * The line that stands in for what the cut removed. It rides INSIDE the
 * budget (the caller subtracts its length before clamping), so announcing
 * the cut can never itself overflow the limit — with an attachment the
 * limit is 1024, and the old flat 40-character margin did not fit a marker
 * plus a path.
 */
const cutMarker = (e: NotifyEvent): string => {
  if (e.path) {
    return '⋯ cut, full text attached';
  }
  // A bare `⋯ cut` announces a loss and then says nothing about it. The owner
  // met one on a live PR card (31.08.2026) — a description long enough to be
  // clamped — and asked what the three dots even referred to. The card had a
  // `Source` link the whole time: the rest was one tap away and the marker
  // never said so.
  //
  // So the marker NAMES the place that holds the rest, and never repeats its
  // value: it used to print the log path in full, and the pointer block then
  // printed the same path again on the very next line.
  //
  // `below` is literal, not a figure of speech: the marker closes the clamped
  // body and the pointer block is appended after it. `line 2` is literal too:
  // since 03.09.2026 the link lives on the name there.
  const logs = 'logs' in e ? e.logs : undefined;
  if (logs) {
    return '⋯ cut, full text at Log below';
  }

  return sourceUrl(e) ? '⋯ cut, full text behind the link on line 2' : '⋯ cut';
};

/**
 * Renders an event into finished HTML text, cut to Telegram's limit.
 *
 * Assembly is TAIL-FIRST (v2.1): the parts that must survive any cut — the
 * tag line (the human filter and the parser's machine key), the pointer
 * block (`Log`/`Check`/`Source`) and the cut marker — are measured before
 * the body is clamped, and the body gets what is left. Under the old order
 * the pointer was part of the body, so the longest cards lost exactly the
 * line saying where to look.
 */
export const render = (e: NotifyEvent): string => {
  const renderer = RENDERERS[e.type] as Renderer<typeof e> | undefined;

  // Covers the `--json` path and calls from JS with no types: there `type`
  // is a plain string, and an unknown value crashed the process through
  // `renderer is not a function`. A notification must never crash anything.
  if (typeof renderer !== 'function') {
    throw new Error(`unknown event type: ${String(e.type)}`);
  }

  const tags = tagsLine(e);
  const pointer = pointerBlock(e);
  const marker = cutMarker(e);
  // clampMessage can go past the passed limit for the tail of closing tags —
  // minus 40 leaves it that margin. Messages already have their own margin
  // (4000 against Telegram's 4096); for a caption the 1024 limit is the real
  // one. A card with an attachment is a caption, so the budget is chosen by
  // `path`.
  const limit = e.path ? 1024 : 4000;
  const budget = Math.max(64, limit - tags.length - pointer.length - marker.length - 42);

  return `${tags}\n${clampMessage(renderer(e), budget, marker)}${pointer}`;
};
