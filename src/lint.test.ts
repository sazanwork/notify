import { test } from 'node:test';
import assert from 'node:assert/strict';

import { lintCard } from './lint.ts';
import { render } from './render.ts';

const good = render({
  type: 'job',
  project: 'playhub',
  job: 'Yandex game import',
  status: 'fail',
  note: 'the source answered 502',
  logs: '~/Library/Logs/daily-import.log',
  key: 'daily-import'
});

test('lint: a card built by the package passes its own standard', () => {
  assert.deepEqual(lintCard(good), []);
});

test('lint: line 1 must be exactly three tags, and the third from the five words', () => {
  assert.match(lintCard('#job #x\n✅ <b>Job:</b> X')[0], /exactly three tags/);
  assert.match(lintCard('#job #x #broken\n✅ <b>Job:</b> X')[0], /vocabulary/);
});

test('lint: line 2 never holds the outcome, an invented word, or nothing', () => {
  assert.match(lintCard('#deploy #x #fail\n🔴 <b>Deploy:</b> fail')[0], /where the name of the thing belongs/);
  assert.match(lintCard('#report #x #info\nℹ️ <b>Report:</b> open')[0], /where the name of the thing belongs/);
  assert.match(lintCard('#job #x #ok')[0], /no line 2/);
});

test('lint: a retired row is a fact already said somewhere else', () => {
  const faults = lintCard('#issue #i1 #info\n🆕 <b>Issue:</b> #1 T\n<b>Number:</b> 1');

  assert.match(faults[0], /"Number:" is back/);
});

test('lint: a link goes to a real address and is named by what it opens', () => {
  const bad = lintCard('#job #x #ok\n✅ <b>Job:</b> <a href="not a url">X</a>');

  assert.match(bad[0], /is not an address/);
  assert.match(
    lintCard('#job #x #ok\n✅ <b>Job:</b> X\n<b>Run:</b> <a href="https://x/r">open</a>')[0],
    /name the thing it opens/
  );
});

test('lint: a signed number is not a comparison, and "all good" is not advice', () => {
  assert.match(lintCard('#report #x #info\nℹ️ <b>Report:</b> R\n<b>Added:</b> +6')[0], /not a comparison/);
  assert.match(lintCard('#report #x #info\nℹ️ <b>Report:</b> R\nall good')[0], /is a status/);
});

test('lint: "all good" quoted inside a body is not a card saying it', () => {
  // The deploy card for the very commit that removed `all good` from the
  // reports quoted the words in its body, and the check complained about it.
  const quoting = render({
    type: 'deploy',
    project: 'playhub',
    status: 'ok',
    via: 'manual, from the Mac',
    commit: 'e3fdd7d',
    commitUrl: 'https://x/c',
    commitBody: 'Recommendations printed `all good` when there was nothing to say.'
  });

  assert.deepEqual(lintCard(quoting), []);
});

test('lint: a red card must say where to look, a silent one need not', () => {
  const deadEnd = render({
    type: 'incident', project: 'vault', title: 'The vault needs repair',
    detail: 'one recipient only — losing the key loses the whole vault'
  });

  assert.match(lintCard(deadEnd)[0], /nowhere to look/);

  // The same card with the log it should have carried all along.
  const withLog = render({
    type: 'incident', project: 'vault', title: 'The vault needs repair',
    detail: 'one recipient only — losing the key loses the whole vault',
    logs: '~/Library/Logs/vault-selfcheck.log'
  });

  assert.deepEqual(lintCard(withLog), []);

  // A task that has gone quiet is `#unknown`, and it has no log because it
  // never ran. Asking for one would be asking for a thing that cannot exist.
  const quiet = render({
    type: 'job', project: 'playhub', job: 'Yandex game import',
    status: 'silent', expected: 'at least once every 26h'
  });

  assert.deepEqual(lintCard(quiet), []);
});

test('lint: an empty instance tag groups nothing', () => {
  assert.match(lintCard('#session # #fail\n🚨 <b>Session</b>')[0], /instance tag is empty/);
});
