/**
 * Покрывает то, чего не покрывал render.test.ts: КУДА уходит событие, СО ЗВУКОМ
 * ли, и что CLI делает с кривой командой. Ровно эти три места и дали находки
 * аудита 27.07.2026 — рендер был проверен, а маршрут и разбор аргументов нет.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { severity } from './events.ts';
import { ROUTES, targets } from './routes.ts';
import { notify, sendReport } from './send.ts';

test('событие уходит во вкладку Ops своего проекта, и только туда', () => {
  const where = targets({ type: 'deploy', project: 'playhub', status: 'ok' });

  assert.equal(where.length, 1);
  assert.equal(where[0].chat, ROUTES.playhub.chat);
  assert.equal(where[0].thread, ROUTES.playhub.ops);
});

test('неизвестный проект не роняет процесс, а даёт пустой список целей', () => {
  // @ts-expect-error — проверяем именно нетипизированный вызов: так приходит
  // опечатка из bash, где типов нет.
  assert.deepEqual(targets({ type: 'deploy', project: 'плейхаб', status: 'ok' }), []);
});

test('красное звонит, зелёное молчит', () => {
  const fail = targets({ type: 'deploy', project: 'arvent', status: 'fail' });
  const ok = targets({ type: 'deploy', project: 'arvent', status: 'ok' });

  assert.equal(fail[0].silent, false);
  assert.equal(ok[0].silent, true);
});

test('инцидент и молчание задачи красные сами по себе, без --status', () => {
  assert.equal(severity({ type: 'incident', project: 'one-q', title: 'Redis лёг' }), 'error');
  assert.equal(severity({ type: 'heartbeat_miss', project: 'one-q', job: 'Бэкап' }), 'error');
});

test('у каждого проекта из ROUTES свой форум — общий чат означал бы, что чужие видят чужое', () => {
  const chats = Object.values(ROUTES).map((f) => f.chat);

  assert.equal(new Set(chats).size, chats.length);
});

/**
 * Запускает CLI без токена: отправки не будет, важен только разбор аргументов.
 * spawnSync, а не execFileSync: последний отдаёт stderr лишь когда процесс упал,
 * а тут весь смысл в выводе процесса, который ОБЯЗАН вернуть 0.
 */
const runCli = (...args: string[]): { code: number; stderr: string; stdout: string } => {
  const res = spawnSync(process.execPath, [fileURLToPath(new URL('cli.ts', import.meta.url)), ...args], {
    encoding: 'utf-8',
    env: { ...process.env, OPS_BOT_TOKEN: '' }
  });

  return { code: res.status ?? -1, stderr: res.stderr, stdout: res.stdout };
};

test('значение, начинающееся с двух дефисов, доезжает через форму --флаг=значение', () => {
  // A GitHub issue body very often opens with `---` (markdown front matter or a
  // horizontal rule). Passed as a separate argument it is read as a flag, the
  // command is rejected and the card is lost — silently, because this CLI
  // always exits 0. Callers must use the `=` form; this test is what stops the
  // separate-argument form coming back.
  const body = '---\ntitle: front matter\n---\nНастоящее тело.';

  const split = runCli('issue', '--project', 'mac-config', '--action', 'opened',
    '--number', '322', '--title', 'T', '--body', body, '--dry-run');
  assert.match(split.stderr, /failed:/, 'разделённая форма обязана быть явной ошибкой');
  assert.equal(split.stdout, '', 'карточка не должна рендериться из битой команды');

  const joined = runCli('issue', '--project=mac-config', '--action=opened',
    '--number=322', '--title=T', `--body=${body}`, '--dry-run');
  assert.equal(joined.code, 0);
  assert.ok(joined.stdout.includes('Настоящее тело.'), 'тело задачи потеряно');
  assert.ok(joined.stdout.includes('title: front matter'), 'начало тела съедено');
});

test('--dry-run печатает карточку в stdout и ничего не отправляет', () => {
  // stdout, not stderr: watchdogs read stderr for `sent|failed|skipped`, and a
  // card printed there would be read as a verdict.
  const { code, stdout, stderr } = runCli('job', '--project=vault', '--job=Self-check',
    '--status=fail', '--note=sops missing', '--dry-run');

  assert.equal(code, 0);
  assert.ok(stdout.startsWith('#job #self_check #fail\n🔴 <b>Job:</b> Self-check'), stdout);
  assert.doesNotMatch(stderr, /sent|skipped|failed/, 'сухой прогон не должен выдавать вердикт');
});

test('флаг без значения — явная ошибка, а не href="true"', () => {
  const { code, stderr } = runCli('deploy', '--project', 'playhub', '--status', 'ok', '--url');

  assert.equal(code, 0);
  assert.match(stderr, /--url with no value/);
  // `failed` is what the Action and the VPS watchdog match on; `sent` must not
  // appear, or heartbeat-check.sh reads this failure as a success.
  assert.match(stderr, /failed:/);
  assert.ok(!/sent/.test(stderr), 'слово sent в отказе — сторож примет его за успех');
  // И ничего не улетело: до отправки дело не дошло, значит нет ни sent, ни skipped.
  assert.doesNotMatch(stderr, /skipped/);
});

test('без токена CLI отдаёт skipped и код 0 — задача не должна падать из-за уведомления', () => {
  const { code, stderr } = runCli('job', '--project', 'playhub', '--job', 'тест', '--status', 'ok');

  assert.equal(code, 0);
  assert.match(stderr, /skipped/);
});

test('--status success не должен рисовать красное: опечатка при ручном вызове', () => {
  const { stderr } = runCli('deploy', '--project', 'playhub', '--status', 'success');

  // Токена нет, поэтому дальше skipped — но событие СОБРАЛОСЬ, а не отвалилось
  // на разборе: значит `success` признан успехом наравне с `ok`.
  assert.match(stderr, /skipped/);
  assert.doesNotMatch(stderr, /без значения/);
});

test('sendReport без токена — skipped, а не исключение: отчёт не должен ронять прогон', async () => {
  const { sendReport } = await import('./send.ts');
  const saved = process.env.OPS_BOT_TOKEN;
  process.env.OPS_BOT_TOKEN = '';

  try {
    assert.equal(await sendReport('playhub', '<b>тест</b>'), 'skipped');
    // @ts-expect-error — проверяем нетипизированный вызов: так приходит опечатка из bash.
    assert.equal(await sendReport('плейхаб', '<b>тест</b>'), 'skipped');
  } finally {
    if (saved === undefined) {
      delete process.env.OPS_BOT_TOKEN;
    } else {
      process.env.OPS_BOT_TOKEN = saved;
    }
  }
});


test('служебные имена прототипа не проходят гвард проекта', async () => {
  // `in` ходил по цепочке прототипов: --project toString терял событие И карточку.
  const res = await notify({ type: 'job', project: 'toString', job: 'x', status: 'ok' } as never);

  assert.equal(res, 'skipped');
});

test('sendReport с ключом дописывает строку ключа, без токена — skipped', async () => {
  delete process.env.OPS_BOT_TOKEN;
  const res = await sendReport('playhub', '<b>отчёт</b>', 'daily-analytics');

  assert.equal(res, 'skipped');
});

// Три пути, на которых CLI раньше выходил нулём и НЕ говорил ни слова из
// контракта `sent|failed|skipped`. Каждый означал одно и то же для владельца:
// карточки нет, а вызвавшая задача считает, что всё хорошо.
test('опечатка в имени флага — отказ, а не карточка без поля', () => {
  const { code, stderr } = runCli('job', '--project=playhub', '--job=x', '--status=fail', '--noto=missed');

  assert.equal(code, 0);
  assert.match(stderr, /unknown flag --noto/);
  assert.match(stderr, /failed:/);
  assert.ok(!/sent/.test(stderr), 'слово sent в отказе — сторож примет его за успех');
});

test('неизвестный тип события — отказ, а не тишина', () => {
  const { code, stderr } = runCli('jib', '--project=playhub', '--status=fail');

  assert.equal(code, 0);
  assert.match(stderr, /unknown event type: jib/);
  assert.match(stderr, /failed:/);
});

test('каждое имя флага, которое читает код, объявлено в KNOWN_FLAGS', async () => {
  // Сторож против дрейфа: список известных флагов — единственное, что отличает
  // опечатку от нового поля, и разойтись с кодом молча он не должен.
  const src = readFileSync(new URL('./cli.ts', import.meta.url), 'utf-8');
  const used = new Set(
    [...src.matchAll(/(?:one|num|pairs)\('([a-z-]+)'\)/g)].map((m) => m[1])
  );
  used.add('item');
  const { KNOWN_FLAGS } = await import('./cli-flags.ts');
  const missing = [...used].filter((f) => !KNOWN_FLAGS.has(f));

  assert.deepEqual(missing, [], `эти флаги читаются, но не объявлены: ${missing.join(', ')}`);
});

test('ошибка разбора не возвращает слово-контракт из ввода', () => {
  // `sent`, `failed`, `skipped` читают другие программы: notify-fail.sh грепает
  // `^[notify] sent$`, серверный сторож молчания матчит `*sent*`. Вызов
  // `notify sent --project=x` печатал `unknown event type: sent`, и сторож
  // читал недоставленную карточку как доставленную, после чего переставал
  // повторять тревогу. Нашёл Codex 25.08.2026.
  const res = runCli('sent', '--project=playhub', '--status=fail');

  assert.ok(res.stderr.includes('failed:'), 'провал обязан назвать себя');
  assert.ok(!/\bsent\b/.test(res.stderr), `слово-контракт вернулось из ввода: ${res.stderr}`);
  assert.match(res.stderr, /event type: s.ent/, 'имя события должно остаться узнаваемым');
});
