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
const OUTCOMES = new Set(['ok', 'fail', 'off', 'unknown', 'news']);

/** Labels the template retired. Each one used to say what a neighbour said. */
const RETIRED = ['Title', 'Number', 'State', 'Via', 'Check', 'Logs', 'Task', 'Id', 'Period'];

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
  } else if (!OUTCOMES.has(tags[2].slice(1))) {
    found.push(`the outcome tag is "${tags[2]}" — the vocabulary is ok, fail, off, unknown, news`);
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

  return found;
};
