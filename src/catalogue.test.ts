// The card standard page must not fall behind the renderer.
//
// The page at claude.ai (artifact 4db72bdb) is the only place that shows all
// 22 card types at once — a feed shows a type only when its event happens, so
// nobody can look at an incident card until there is an incident. It is drawn
// by this package's own renderer, so it is only true while it is current.
//
// It went stale twice in one evening, both times the same way: a change landed
// in `src/`, the page was not rebuilt, and the page kept describing a card
// shape the code had left behind. The owner then read it as the standard.
//
// mac-config has a guard for this (`tests/check-standard-page-fresh.py`), but
// it lives in the OTHER repository — the one where notification changes are
// NOT made. This one fires here, where the renderer is edited.
//
// The publish itself is a hand step: no script can push the file to claude.ai.
// So the failure message spells out the whole procedure including that step,
// which is the owner's own rule — "когда идут правки по уведомлениям, то сразу
// должны правиться и этот артефакт" (31.08.2026).
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import test from 'node:test';

const at = (p: string) => new URL(p, import.meta.url);
const PAGE = at('../catalogue/telegram-cards.html');
const ARTIFACT = 'https://claude.ai/code/artifact/4db72bdb-3303-4876-86dd-a40b3e04a938';
const HOW = [
  '',
  '  npm run catalogue',
  `  then publish catalogue/telegram-cards.html to ${ARTIFACT}`,
  '  (the publish is a hand step — no script can do it)'
].join('\n');

// Only what the page is DRAWN from. A test file is in `src/` too, and counting
// it made every edit to this very file report the page as stale — a guard that
// cries on work that cannot affect it is a guard that gets ignored.
const newestSource = (): number =>
  Math.max(
    ...readdirSync(at('../src/'))
      .filter((f) => !f.endsWith('.test.ts'))
      .map((f) => statSync(at('../src/' + f)).mtimeMs)
  );

test('catalogue: the standard page is built from the current renderer', () => {
  // The page is gitignored, so a fresh clone has none. That is not staleness.
  if (!existsSync(PAGE)) {
    return;
  }

  assert.ok(
    statSync(PAGE).mtimeMs >= newestSource(),
    `the standard page is older than src/ — it now describes a card shape the code has left behind.${HOW}`
  );
});

test('catalogue: the page names the version it was built against', () => {
  if (!existsSync(PAGE)) {
    return;
  }

  const version = JSON.parse(readFileSync(at('../package.json'), 'utf8')).version;
  const page = readFileSync(PAGE, 'utf8');
  // The machine stamp, never the prose. Parsing the prose put a Russian date
  // in the version's place once and refused a sentence-final version once.
  const stamped = /<!-- notify-catalogue version=([^ ]+) -->/.exec(page);

  assert.ok(stamped, `the page carries no version stamp — assemble.mjs changed shape.${HOW}`);
  assert.equal(
    stamped[1],
    version,
    `the page was built against ${stamped[1]}, the package is ${version}.${HOW}`
  );
});
