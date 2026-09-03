/**
 * The card checks itself, at the moment it is sent.
 *
 * Everything else that guards the template runs on examples: the tests on
 * fixtures, the catalogue build on twenty-one hand-written cards. A live
 * sender passes values none of them ever pass — an empty title, a status word
 * from a `--json` payload, a number with a plus sign built by hand — and the
 * card that reaches the owner is the one nobody looked at.
 *
 * So the finished HTML is read here, right before delivery, by the same rules
 * the page states. A card that breaks them is STILL SENT: a notification is
 * never worth losing, and a lint is not a reason to drop one. The breach is
 * reported separately, as its own red card to mac-config, the way a lost
 * project already is.
 */

/** The words that are never a name, in the slot where the name belongs. */
const NOT_A_NAME = new Set([
  'ok',
  'fail',
  'failed',
  'error',
  'success',
  'disabled',
  'silent',
  'unknown',
  'open',
  'the run',
  'run',
  'done',
  'undefined',
  'null'
]);

/** The five words the third tag is allowed to be, and there is no sixth. */
const OUTCOMES = new Set(['ok', 'fail', 'off', 'unknown', 'info']);

/**
 * Labels the template retired. Each one used to say what a neighbour said.
 * `Check` LEFT this list in v2.1: rule S brought it back as the standard
 * verification-command row. `Logs` stays retired — the new spelling is `Log`.
 */
const RETIRED = ['Title', 'Number', 'State', 'Via', 'Logs', 'Task', 'Id', 'Period'];

/**
 * Reads a finished card and returns what is wrong with it, in the owner's
 * terms. An empty array means the card obeys the standard.
 */
export const lintCard = (html: string): string[] => {
  const rows = html.split('\n');
  const found: string[] = [];
  const tags = (rows[0] ?? '').trim().split(/\s+/);

  if (tags.length !== 3 || !tags.every((t) => t.startsWith('#'))) {
    found.push(`line 1 is "${rows[0] ?? ''}" — it must be exactly three tags`);
  } else {
    if (!OUTCOMES.has(tags[2].slice(1))) {
      found.push(`the outcome tag is "${tags[2]}" — the vocabulary is ok, fail, off, unknown, info`);
    }
    // The charset is checked HERE, not trusted to slug(): slug keeps any
    // Unicode letter, so a Russian-named job produces a Cyrillic tag with no
    // complaint anywhere — confirmed against render.ts on 31.08.2026.
    for (const t of tags) {
      if (!/^#[a-z0-9_]+$/.test(t)) {
        found.push(`the tag "${t}" carries characters outside [a-z0-9_] — tags are English, lowercase`);
      }
    }
    // A dated tag groups nothing: every day mints a new one and the filter
    // the tags exist for never collects two cards.
    if (/(_|^#)20\d{2}_\d{2}_\d{2}$/.test(tags[1]) || /_20\d{6}$/.test(tags[1])) {
      found.push(`the instance tag "${tags[1]}" ends in a date — a dated tag groups nothing`);
    }
  }

  if (tags[1] === '#' || tags[1] === '#_') {
    found.push('the instance tag is empty — it groups nothing and pairs with nothing');
  }

  const second = rows[1] ?? '';

  if (!second) {
    found.push('there is no line 2 — a card must say what it is about');
  }

  // The identifier: what stands after `Type:`, with or without a link on it.
  const named = second.match(/<b>[^<]+:<\/b>\s*(?:<a href="[^"]*">)?([^<]*)/);

  if (named && NOT_A_NAME.has(named[1].trim().toLowerCase())) {
    found.push(`line 2 says "${named[1].trim()}" where the name of the thing belongs`);
  }

  for (const label of RETIRED) {
    if (html.includes(`<b>${label}:</b>`)) {
      found.push(`the row "${label}:" is back — that fact is already said somewhere else`);
    }
  }

  // Every link must go somewhere a tap can reach, and must be named by what it
  // opens. A local path is not a link at all — it is monospaced, to be copied.
  for (const m of html.matchAll(/<a href="([^"]*)">([^<]*)<\/a>/g)) {
    const [, href, text] = m;

    if (!/^https?:\/\/\S+$/.test(href)) {
      found.push(`the link "${text}" points at "${href}", which is not an address`);
    }
    if (NOT_A_NAME.has(text.trim().toLowerCase())) {
      found.push(`a link named "${text}" — name the thing it opens, not the click`);
    }
  }

  // A number is either compared or it is not. A sign in front of it looks like
  // a comparison and is not one.
  for (const m of html.matchAll(/<b>([^<]+):<\/b> ([^\n<]*)/g)) {
    if (/(^|\s)[+\-]\d/.test(m[2])) {
      found.push(`"${m[1]}: ${m[2]}" — a signed number is not a comparison`);
    }
  }

  // Only when it IS the value of a row or a list item. The first shape of this
  // rule read the whole card, so a deploy card quoting the words inside a
  // commit body — the very commit that removed `all good` from the reports —
  // raised a complaint about itself.
  for (const row of rows) {
    const value = row
      .replace(/^•\s*/, '')
      .replace(/^<b>[^<]*:<\/b>\s*/, '')
      .replace(/<[^>]+>/g, '')
      .trim();

    if (/^all good$/i.test(value)) {
      found.push('"all good" is a status, not a recommendation');
      break;
    }
  }

  // Rule L (v2.1): everything the SYSTEM says is English. Cyrillic is
  // allowed only as QUOTED CONTENT — text that exists in Russian outside the
  // card: a blockquote (commit bodies, issue bodies, an offender's lines),
  // the text of a link (issue titles in digests), and the title slot on
  // line 2. Everywhere else — a label, a bare field value, a tag, a command —
  // it is system text and a fault.
  const quotedStripped = html
    .replace(/<blockquote[^>]*>[\s\S]*?<\/blockquote>/g, '')
    .replace(/<a href="[^"]*">[^<]*<\/a>/g, '')
    // A commit's title rides the `Commit:` row after the hash — it is a
    // commit message, the canonical quoted content.
    .replace(/^<b>Commit:<\/b>.*$/gm, '')
    // List items carry content (issue titles in a digest, findings) — the
    // row's own text is the subject's, not the system's.
    .replace(/^(?:•|\d+\.) .*$/gm, '')
    // An item's indented fact rows and a group heading name what the SENDER
    // groups by; keep them system-English — no exception here.
    ;
  const strippedRows = quotedStripped.split('\n');
  // Line 2's value after the label is the one non-quoted slot allowed to
  // carry a title written in Russian (issue/PR/report/incident titles).
  if (strippedRows[1]) {
    strippedRows[1] = strippedRows[1].replace(/(<b>[^<]+:<\/b>|<b>[^<]+<\/b>).*/, '$1');
  }
  if (/[а-яё]/i.test(strippedRows.join('\n'))) {
    found.push('Cyrillic outside quoted content — system text is English (rule L)');
  }

  // Rule S (v2.1, amended 03.09.2026): a card that reports trouble must say
  // where to verify it — a `Check:` command, a `To do:` command, or any link
  // at all (the link now rides on the name on line 2, not on a `Source:` row). A `Log:` path alone is not enough: a path cannot be tapped, and a
  // card whose only pointer needs a file manager is a card with no pointer.
  // `#fail` and `#unknown` both: a silent task has no log, but `config jobs
  // --log <key>` answers it too.
  const broke = (rows[0] ?? '').includes('#fail') || (rows[0] ?? '').includes('#unknown');

  if (broke && !html.includes('<b>Check:</b>') && !html.includes('<b>To do:</b>') && !html.includes('<a href=')) {
    found.push('a trouble card with no check command and no link — nowhere to look (rule S)');
  }

  return found;
};
