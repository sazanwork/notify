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
  check: 'config jobs --log daily-import',
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

test('lint: a trouble card must say where to verify — a Log path alone is not enough (rule S)', () => {
  const deadEnd = render({
    type: 'incident', project: 'vault', title: 'The vault needs repair',
    detail: 'one recipient only — losing the key loses the whole vault'
  });

  assert.match(lintCard(deadEnd).join('\n'), /nowhere to look/);

  // A Log path alone stays a fault: a path cannot be tapped, only copied.
  const logOnly = render({
    type: 'incident', project: 'vault', title: 'The vault needs repair',
    detail: 'one recipient only — losing the key loses the whole vault',
    logs: '~/Library/Logs/vault-selfcheck.log'
  });

  assert.match(lintCard(logOnly).join('\n'), /nowhere to look/);

  // A Check command answers it.
  const withCheck = render({
    type: 'incident', project: 'vault', title: 'The vault needs repair',
    detail: 'one recipient only — losing the key loses the whole vault',
    logs: '~/Library/Logs/vault-selfcheck.log',
    check: 'config jobs --log vault-selfcheck'
  });

  assert.deepEqual(lintCard(withCheck), []);

  // A silent task never ran and has no log — but `config jobs --log <key>`
  // answers it too, so `#unknown` demands a pointer the same way `#fail` does.
  const quiet = render({
    type: 'job', project: 'playhub', job: 'Yandex game import',
    status: 'silent', expected: 'at least once every 26h'
  });

  assert.match(lintCard(quiet).join('\n'), /nowhere to look/);

  const quietWithCheck = render({
    type: 'job', project: 'playhub', job: 'Yandex game import',
    status: 'silent', expected: 'at least once every 26h',
    check: 'config jobs --log yandex-import'
  });

  assert.deepEqual(lintCard(quietWithCheck), []);
});

test('lint: an empty instance tag groups nothing', () => {
  assert.match(lintCard('#session # #fail\n🚨 <b>Session</b>').join('\n'), /instance tag is empty/);
});

test('lint: tags are lowercase [a-z0-9_], and a dated tag groups nothing (v2.1)', () => {
  assert.match(
    lintCard('#job #аналитика #fail\n🔴 <b>Job:</b> X\n<b>Check:</b> <code>x</code>').join('\n'),
    /outside \[a-z0-9_\]/
  );
  assert.match(
    lintCard('#report #analytics_2026_08_21 #info\nℹ️ <b>Report:</b> X').join('\n'),
    /ends in a date/
  );
});

test('lint: Cyrillic outside quoted content is a fault; quoted content is free (rule L)', () => {
  // System text in Russian — a fault.
  assert.match(
    lintCard('#job #x #fail\n🔴 <b>Job:</b> X\n<b>Reason:</b> сеть упала\n<b>Check:</b> <code>x</code>').join('\n'),
    /rule L/
  );
  // A commit body in a blockquote, an issue title on line 2, a Russian link
  // text — all quoted content, all allowed.
  const quoting =
    '#issue #i1 #info\n🆕 <b>Issue:</b> #1 Кнопочная запись\n<blockquote>Тело задачи по-русски.</blockquote>\n<b>Source:</b> <a href="https://x/i/1">issue</a>';

  assert.deepEqual(lintCard(quoting), []);
});

test('lint: the Check row is back in the vocabulary, Logs stays retired (v2.1)', () => {
  const withCheck = '#job #x #fail\n🔴 <b>Job:</b> X\n<b>Check:</b> <code>config jobs --log x</code>';

  assert.deepEqual(lintCard(withCheck), []);
  assert.match(
    lintCard('#job #x #fail\n🔴 <b>Job:</b> X\n<b>Logs:</b> <code>/x</code>\n<b>Check:</b> <code>x</code>').join('\n'),
    /"Logs:" is back/
  );
});
