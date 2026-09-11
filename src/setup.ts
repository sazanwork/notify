/**
 * `notify setup <forum chat_id> <project key>` creates the "Ops" and "Dev"
 * tabs in a forum that already exists, and prints the ready line for `ROUTES`.
 *
 * Tab shape (the standard tests/check-telegram-shape.py enforces): plain
 * titles with a NATIVE topic icon, never an emoji in the title text — Ops
 * carries 🤖 (robots post there), Dev carries 💬 (people talk there). The
 * icon ids below are documents of Telegram's topic-icon sticker set,
 * resolved live on 2026-09-10; ⚙️ is NOT in that set, which is why the
 * robot glyph is 🤖.
 *
 * A product of SEVERAL repositories shares one forum, one Ops tab PER
 * repository (a card belongs to the repo it came from) and ONE Dev tab.
 * The Bot API cannot list a forum's topics, so the shape is decided from
 * `ROUTES` itself: peers are rows that already point at this chat.
 *
 * The bot cannot create the forum supergroup itself — Telegram only allows a
 * real account to do that. So the order for a new project is
 * (mac-config's tg-forums skill, scripts/create-ops-chat.py --forum does all
 * of step 1):
 *   1. create a group in Telegram, turn on "Topics" in it, add
 *      @mikita_ops_bot as an admin with the "Manage topics" right;
 *   2. run `notify setup <chat_id> <project key>` — it creates the tabs and
 *      prints the line;
 *   3. paste the line into `src/routes.ts`.
 */
import { ROUTES } from './routes.ts';

const log = (msg: string): void => console.error(`[notify] ${msg}`);

// Documents of Telegram's topic-icon set (InputStickerSetEmojiDefaultTopicIcons):
// 🤖 for Ops, 💬 for Dev. A wrong id here writes a dead icon into every new
// forum — tests/check-telegram-shape.py catches a dropped icon live.
const OPS_ICON_ID = '5309832892262654231'; // 🤖
const DEV_ICON_ID = '5417915203100613993'; // 💬

const createTopic = async (
  token: string,
  chat: string,
  name: string,
  iconId: string,
  color: number
): Promise<number | null> => {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/createForumTopic`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, name, icon_color: color, icon_custom_emoji_id: iconId }),
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

  // The Bot API cannot enumerate topics, so the forum's shape is read from
  // ROUTES: a row already pointing here is a peer repository of the same
  // product.
  const existing = ROUTES[projectKey as keyof typeof ROUTES];

  if (existing && existing.chat === chatId && existing.ops !== undefined) {
    log(`${projectKey} is already in ROUTES with ops=${existing.ops} — nothing to create`);

    return;
  }

  const peers = Object.entries(ROUTES).filter(([key, row]) => key !== projectKey && row.chat === chatId);
  // A second repository of the same product gets its name on its own Ops tab;
  // the product's FIRST tab is plain "Ops" (rename it when a second repo
  // joins — tests/check-telegram-shape.py goes red until it is done).
  const opsTitle = peers.length > 0 ? `Ops · ${projectKey}` : 'Ops';
  const sharedDev = peers.map(([, row]) => row.dev).find((id) => id !== undefined);

  const ops = await createTopic(token, chatId, opsTitle, OPS_ICON_ID, 9367192);
  const dev = sharedDev ?? (await createTopic(token, chatId, 'Dev', DEV_ICON_ID, 7322096));

  // Partial success: if only Ops was created, print it. Otherwise running the
  // command again would create A DIFFERENT Ops topic, and the old id would be lost.
  if (ops === null) {
    log('Ops was not created — check: is the bot a group admin with "Manage topics", and are topics on?');

    return;
  }
  if (dev === null || dev === undefined) {
    log(`Ops created (id=${ops}), Dev was not — add Dev by hand or run again, and keep ops=${ops}`);
    log('add to src/routes.ts (fill dev in afterwards):');
    log(`  ${JSON.stringify(projectKey)}: { chat: '${chatId}', ops: ${ops}, dev: <fill in> },`);

    return;
  }

  log(`tabs created: Ops="${opsTitle}" (${ops}), Dev (${dev})${sharedDev ? ' [shared with a peer repo]' : ''}`);
  log('add to src/routes.ts:');
  log(`  ${JSON.stringify(projectKey)}: { chat: '${chatId}', ops: ${ops}, dev: ${dev} },`);
};
