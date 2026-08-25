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

/** First letter capitalized, the rest left as is (ga4/GitHub stay themselves). */
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
export const clampMessage = (text: string, limit = 4000): string => {
  if (text.length <= limit) {
    return text;
  }

  const cut = text.slice(0, limit);
  const lastBreak = cut.lastIndexOf('\n');
  // Cut on a line boundary — only if that keeps most of the content.
  let end = lastBreak > limit * 0.6 ? lastBreak : limit;

  // Never cut inside `<...>` or inside `&...;` — otherwise the markup breaks.
  const openTag = cut.lastIndexOf('<', end - 1);
  if (openTag !== -1 && cut.indexOf('>', openTag) === -1) {
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
  const tagRe = /<(\/?)(b|a|i|u|code|blockquote)[ >]/g;
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

  return `${body}${tail}\n…`;
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

/**
 * An action field (`workflow:`): unlike `fieldLink`, without a URL this is
 * NOT a field — the run simply has nowhere to lead, and showing the bare
 * word "run" with no link is more meaningless than not showing the row at
 * all.
 */
// The link text is the name of where it leads (the workflow's name, the run's
// name). The fallback word used to be "run": a noun that names nothing — the
// owner read "Workflow: run" and did not understand what it was. "open" is a
// verb, and it is at least honest about being a link, not a name.
const fieldAction = (label: string, url: string | undefined, text: string | undefined): string | null =>
  url ? `<b>${esc(cap(label))}:</b> <a href="${esc(url)}">${esc(text ?? 'open')}</a>` : null;

/** A monospace field — a path/command to copy, not a link. */
const fieldCode = (label: string, value: string | undefined): string | null =>
  value ? `<b>${esc(cap(label))}:</b> <code>${esc(value)}</code>` : null;

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

/** An item inside a group: `<b>label:</b> <a>text</a>` — or a plain bulleted/numbered row with no label. */
const groupItem = (it: Item, index: number, numbered: boolean): string => {
  const linked = it.url ? `<a href="${esc(it.url)}">${esc(it.text)}</a>` : esc(it.text);

  if (it.label) {
    return `<b>${esc(it.label)}:</b> ${linked}`;
  }

  return numbered ? `${index + 1}. ${linked}` : `• ${linked}`;
};

// A long explanation (a note, incident details) — as a quote: in Telegram
// that is a bar on the left and a light indent, reading as "details," not as
// part of the heading. Longer than ~400 characters and the quote collapses
// on its own (`expandable`, Bot API), otherwise a stack trace or a log dump
// stretches the card across the whole screen.
const EXPAND_AT = 400;
const note = (text: string | undefined): string | null => {
  if (!text) {
    return null;
  }
  const body = esc(text);

  return body.length > EXPAND_AT ? `<blockquote expandable>${body}</blockquote>` : `<blockquote>${body}</blockquote>`;
};

/**
 * A quote with a caption. A bare quote reads as a continuation of the
 * field above it: the owner asked about the line that opens a session,
 * "what does this text mean, where does it come from" — and he was right,
 * the card says it nowhere. The caption stands on its own line, because
 * the text itself does not fit in a field: a field holds one line and cuts
 * it.
 */
/**
 * A quote that needs saying what it is. The heading is a GROUP heading — the
 * same italic-underline every other card uses over a block — not a bold field
 * label: a bold label means `label: value` on one line, and using it here made
 * the session card the only one whose block was titled a third way. The owner
 * read the card and asked where its group was.
 */
const quoted = (label: string, text: string | undefined): string | null =>
  text ? `${group(label)}\n${note(text)}` : null;

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
  const linked = fieldLink('Commit', url, hash);

  if (linked === null || !title) {
    return linked ?? field('Commit', title);
  }

  return `${linked} ${esc(firstLine(title))}`;
};

const bodyQuote = (body: string | undefined): string | null =>
  body ? note(body) : null;

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
  const list = rows ?? [];
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
 * mechanism (`manual, from the Mac`). Last resort `the run`, and only when a
 * link exists: losing the link to the logs on a red card is the one loss this
 * format cannot afford, and a row that says nothing is still better than a
 * card with nowhere to click. No live sender reaches that last resort — the
 * GitHub Action always fills the workflow name, and the hand-run scripts send
 * no run link at all.
 */
const mechanism = (
  workflowName: string | undefined,
  via: string | undefined,
  runUrl: string | undefined
): string | undefined => workflowName ?? via;

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
  const runUrl = e.workflowUrl ?? e.url;

  return join([
    // The name of what shipped the deploy sits on the type line. The outcome
    // is already said by the icon and the third tag; there is nothing to
    // repeat in words, and it is the same law a job and a report follow. The
    // `Via` row is gone: it used to carry this same name one floor below.
    typeLine(icon, 'Deploy', mechanism(e.workflowName, e.via, runUrl), runUrl),
    ...twoBlocks(
      [field('Target', e.target), field('Reason', e.note)],
      [commitRow(e.commit, e.commitUrl, e.commitTitle), bodyQuote(e.commitBody)]
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
    typeLine(icon, 'Job', e.job, e.workflowUrl ?? e.url, e.aside),
    field('Reason', e.note),
    // The timetable is a different subject from this event: how often the task
    // owes a sign of life and when it last gave one. It stood in a bare run
    // under `Reason:` and read as more of the same. `Last run` when the task
    // is alive, `Last seen` when it is not — one timestamp, two questions.
    ...schedule(e.expected, e.lastSeen, e.status === 'silent' ? 'Last seen' : 'Last run'),
    ...labelled(e.stats),
    hasItems ? '' : null,
    // Heading ONLY for `disabled`. It used to print for any job carrying a
    // list, so playhub's daily card of newly published games was headed
    // "Disabled workflows".
    disabledList ? group('Disabled workflows') : null,
    ...(hasItems ? bullets(e.items, disabledList) : []),
    e.command || e.logs ? '' : null,
    fieldCode('Log', e.logs),
    ...fieldRun(e.command, e.commandNote)
    // No trailing `Workflow:` row. It pointed at `workflowUrl ?? url` — the
    // exact address line 2 already carries — so it was one destination
    // written twice, and it stood BELOW the `To do:` command, which is the
    // last thing the card is supposed to say.
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
    // Both analytics jobs send a link to the day's snapshot in docs/. It used to
    // hang off a trailing `Details: open` row; now it is the report's own name.
    typeLine(iconFor(e), 'Report', e.title, e.url, e.aside),
    // Flush against the header — see the branch above.
    ...labelled(e.lines),
    items.length > 0 ? '' : null,
    ...items
  ]);
};

// Same law as the deploy card, one row up: what ran is named beside the type
// line and carries the link to its run. The label is `Check` and not `Via`
// because here the name answers WHICH gate spoke — `nightly`, `Quality` —
// while on a deploy it answers by what means the code was shipped.
const renderCi: Renderer<Extract<NotifyEvent, { type: 'ci' }>> = (e) => {
  const icon = iconFor(e);
  const runUrl = e.workflowUrl ?? e.url;

  return join([
    typeLine(icon, 'CI', mechanism(e.workflowName, undefined, runUrl), runUrl),
    // `Actor` names who is behind the commit, not who ran the check — it moved
    // into the Change block, next to the commit it belongs to. It used to sit
    // with `Reason` in the run block, and the owner read it as a jumble: "commit,
    // actor, workflow — I don't know, it's all a jumble."
    ...twoBlocks(
      [field('Reason', e.note)],
      [field('Actor', e.actor), commitRow(e.commit, e.commitUrl, e.commitTitle), bodyQuote(e.commitBody)]
    )
  ]);
};

// A pull request and an issue are identified the way GitHub itself identifies
// them: `#118 <title>`, one string, and it is the link. It used to take three
// rows — the action on line 2, `Number:` under it, `Title:` under that — so
// the thing the card is about could not be read without reading three lines.
// The action is not repeated in words: the icon carries it, and no two actions
// of one type share an icon.
const named = (number: number, title: string | undefined): string =>
  title ? `#${number} ${title}` : `#${number}`;

// The people come BEFORE the text, and the text comes only when it is the
// news. An `assigned` card carries one new fact — who took it — and it used to
// sit dead last, under the issue's entire description: the owner read a card
// about someone taking issue #312 and asked who, because he never got that far.
//
// The description is the news exactly once, when the thing is opened. On
// assigned, closed, merged or a review verdict it is text he has already read,
// and it buries the one line he came for.
const opening = (action: string, body: string | undefined): string | null =>
  action === 'opened' ? bodyQuote(body) : null;

// The body is what the title stands for — it sits directly under the name,
// with nothing between them. The people come after, consolidated in one
// place, never splitting the title from what it names: the owner on the
// old order, title then Author then Assignee then finally the body — "why
// does the assignee cut apart what should be inseparable?"
const renderPr: Renderer<Extract<NotifyEvent, { type: 'pr' }>> = (e) =>
  join([
    typeLine(iconFor(e), 'PR', named(e.number, e.title), e.url),
    opening(e.action, e.body),
    e.action === 'opened' && e.body ? '' : null,
    field('Author', e.author),
    field('Reviewer', e.reviewer)
  ]);

const renderIssue: Renderer<Extract<NotifyEvent, { type: 'issue' }>> = (e) =>
  join([
    typeLine(iconFor(e), 'Issue', named(e.number, e.title), e.url),
    opening(e.action, e.body),
    e.action === 'opened' && e.body ? '' : null,
    field('Author', e.author),
    field('Assignee', e.assignee)
  ]);

// The incident's own title IS line 2, exactly as an issue's is. It used to say
// the word `open` there — which the 🚨 already says, and no other card repeats
// its icon in words — with the real title one row below under a `Title:` label.
//
// `detail` is a diagnosis of several lines (vault greps three of them plus a
// log path). It used to go through `field`, which keeps only the first line, so
// every alarm this package ever sent arrived gutted. It is quoted now, the same
// shape a commit body takes.
const renderIncident: Renderer<Extract<NotifyEvent, { type: 'incident' }>> = (e) =>
  join([
    typeLine(iconFor(e), 'Incident', e.title, e.url),
    e.detail && e.detail !== e.title ? note(e.detail) : null,
    e.logs ? '' : null,
    fieldCode('Log', e.logs)
  ]);

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
    field('Reason', e.reason),
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
 * Renders an event into finished HTML text, cut to Telegram's limit.
 * Tags are the FIRST line, added before the cut (not after, as before):
 * they carry both the human filter and the parser's machine key — a card
 * cut without them would be not only unclickable but invisible to the
 * parser on exactly the longest, meaning the most important, messages.
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
  // clampMessage can go past the passed limit for the tail of closing tags
  // and the ellipsis — minus 40 leaves it that margin. Messages already have
  // their own margin (4000 against Telegram's 4096); for a caption the 1024
  // limit is the real one. A card with an attachment is a caption, so the
  // budget is chosen by `path`.
  const budget = Math.max(64, e.path ? 1024 - tags.length - 40 : 4000 - tags.length - 1);

  return `${tags}\n${clampMessage(renderer(e), budget)}`;
};
