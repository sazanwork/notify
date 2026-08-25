/**
 * `notify setup "<Project name>"` creates the "⚙️ Ops" and "💬 Dev" tabs in a
 * forum that already exists, and prints the ready line for `ROUTES`.
 *
 * The bot cannot create the forum supergroup itself — Telegram only allows a
 * real account to do that. So the order for a new project is:
 *   1. create a group in Telegram, turn on "Topics" in it, add
 *      @mikita_ops_bot as an admin with the "Manage topics" right;
 *   2. run `notify setup <chat_id>` — it creates both tabs and prints the line;
 *   3. paste the line into `src/routes.ts`.
 *
 * Step 1 happens once per project and takes half a minute. Steps 2 and 3 are
 * mechanical.
 */
const log = (msg: string): void => console.error(`[notify] ${msg}`);

const createTopic = async (token: string, chat: string, name: string, color: number): Promise<number | null> => {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/createForumTopic`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, name, icon_color: color }),
      signal: AbortSignal.timeout(10_000)
    });

    const body = (await res.json()) as {
      ok: boolean;
      result?: { message_thread_id: number };
      description?: string;
    };

    if (!body.ok || !body.result) {
      log(`could not create "${name}": ${body.description ?? `HTTP ${res.status}`}`);

      return null;
    }

    return body.result.message_thread_id;
  } catch (err) {
    // Network error, timeout, or an unreadable response — do not crash the CLI (its contract: always exit 0).
    log(`could not create "${name}": ${err instanceof Error ? err.message : String(err)}`);

    return null;
  }
};

export const setupTopic = async (chatId: string, projectKey: string): Promise<void> => {
  const token = process.env.OPS_BOT_TOKEN?.trim();

  if (!token) {
    log('no OPS_BOT_TOKEN — cannot create the tabs');

    return;
  }

  const ops = await createTopic(token, chatId, '⚙️ Ops', 9367192);
  const dev = await createTopic(token, chatId, '💬 Dev', 7322096);

  // Partial success: if only Ops was created, print it. Otherwise running the
  // command again would create A DIFFERENT Ops topic, and the old id would be lost.
  if (ops === null) {
    log('Ops was not created — check: is the bot a group admin with "Manage topics", and are topics on?');

    return;
  }
  if (dev === null) {
    log(`Ops created (id=${ops}), Dev was not — add Dev by hand or run again, and keep ops=${ops}`);
    log('add to src/routes.ts (fill dev in afterwards):');
    log(`  ${JSON.stringify(projectKey)}: { chat: '${chatId}', ops: ${ops}, dev: <fill in> },`);

    return;
  }

  log(`tabs created: Ops=${ops}, Dev=${dev}`);
  log('add to src/routes.ts:');
  log(`  ${JSON.stringify(projectKey)}: { chat: '${chatId}', ops: ${ops}, dev: ${dev} },`);
};
