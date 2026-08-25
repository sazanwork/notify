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
  assert.match(lintCard('#report #x #news\nℹ️ <b>Report:</b> open')[0], /where the name of the thing belongs/);
  assert.match(lintCard('#job #x #ok')[0], /no line 2/);
});

test('lint: a retired row is a fact already said somewhere else', () => {
  const faults = lintCard('#issue #i1 #news\n🆕 <b>Issue:</b> #1 T\n<b>Number:</b> 1');

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
  assert.match(lintCard('#report #x #news\nℹ️ <b>Report:</b> R\n<b>Added:</b> +6')[0], /not a comparison/);
  assert.match(lintCard('#report #x #news\nℹ️ <b>Report:</b> R\nall good')[0], /is a status/);
});

test('lint: an empty instance tag groups nothing', () => {
  assert.match(lintCard('#session # #fail\n🚨 <b>Session</b>')[0], /instance tag is empty/);
});
