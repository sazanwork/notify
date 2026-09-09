/**
 * Routing "event → where to send." The ONLY place that a new project
 * touches: add a row to `ROUTES` — no new bot, no new secret, no edits in
 * the projects themselves.
 *
 * The scheme: ONE CHAT PER PROJECT. A project with a team is a forum
 * supergroup with an "⚙️ Ops" tab (robot notifications) and a "💬 Dev" tab
 * (people's live chat). A project the owner runs alone is a plain
 * supergroup without topics — the robots post straight into it and there
 * is nobody to talk to in a Dev tab (owner's rule of 2026-09-05; the first
 * such chat is `htmlg`). A plain chat has no `ops` number: the message
 * goes to the chat itself.
 *
 * Why not one shared forum with a topic per project — that was the first
 * version, and it turned out to be a mistake: Telegram cannot hide one
 * topic from a member — whoever is in the group sees ALL the tabs. That
 * means employees cannot be let in, they need their own chat, and one
 * project ends up living in two places at once ("the owner's topic" +
 * "the team's channel"). A forum per project removes the duplication: an
 * employee is added to their own project's forum and does not see anyone
 * else's, and the scheme is the same for everyone — people show up on a
 * new project, just add them to the same forum.
 *
 * Chat and topic ids are not a secret: without the bot's token they are
 * useless. So they live in code, not in environment variables (otherwise
 * "add a project" means edits in three places). There is exactly one
 * secret — `OPS_BOT_TOKEN`.
 */
import type { NotifyEvent, Project } from './events.ts';
import { DISPLAY, severity } from './events.ts';

type Forum = {
  /** The id of the project's supergroup (forum or plain). */
  chat: string;
  /**
   * The chat's own title, and ONLY for a chat shared by several repositories
   * of one product. A repository is a project row here, but the chat belongs
   * to the product above them, so its name cannot be derived from any single
   * row — every row sharing a chat carries the same `title`. Left out
   * everywhere else, where `chatTitle()` derives the name from the project.
   */
  title?: string;
  /**
   * The "⚙️ Ops" tab — robots write here. Absent for a plain chat without
   * topics (a solo project): the message then goes to the chat itself.
   */
  ops?: number;
  /**
   * The "💬 Dev" tab — people. The bot does not write here; the field is
   * kept for completeness. Optional: an infrastructure forum has no people
   * and nothing to discuss, and an empty tab would read as a forgotten
   * setting, not as room to grow into.
   */
  dev?: number;
};

export const ROUTES: Record<Project, Forum> = {
  // Zabukai is one product built from two repositories, so it is two rows
  // sharing one forum: an Ops tab EACH, because a card belongs to the
  // repository it came from, and ONE Dev tab, because the people talking in
  // it are one team working on one product (owner's rule, 09.09.2026).
  //
  // ops/dev = 22/23, not 3/4: the old tabs were deleted by hand on
  // 27.07.2026, and Telegram removes a topic's messages along with it. A
  // recreated topic gets a NEW id — a topic's id is the id of its first
  // message, it is never reused. 962 is the site's Ops tab, created
  // 09.09.2026.
  'zabukai-app': { chat: '-1004299939100', title: 'Zabukai', ops: 22, dev: 23 },
  'zabukai-site': { chat: '-1004299939100', title: 'Zabukai', ops: 962, dev: 23 },
  // Every row below is a project the owner runs alone. Their Topics were
  // turned off on 06.09.2026 and their `ops` numbers went with them: a card
  // now goes to the chat itself. Sending a thread id into a chat that is no
  // longer a forum fails with "message thread not found", so a row here and
  // the chat's own setting must always agree.
  playhub: { chat: '-1004418379613' },
  'game-publisher': { chat: '-1004292453693' },
  'one-q': { chat: '-1004466909784' },
  vault: { chat: '-1004459314999' },
  'mac-config': { chat: '-1004442522004' },
  alitools: { chat: '-1003904331479' },
  // Created 05.09.2026 as «HTMLG · Ops», the first chat built this way
  // (HTMLG is the HTML5-games business; the brand and domain of its portal
  // may change, the project name does not).
  htmlg: { chat: '-1004334723487' },
  // Created 08.09.2026 as «2Roles · Ops»: the third focus project, the owner
  // runs it alone.
  '2roles': { chat: '-1004314188744' },
  // Created 09.09.2026 by create-ops-chat.py as «Market Lens»: the owner and
  // Semyon, so a forum; the tab numbers come from `notify setup`.
  'market-lens': { chat: '-1004489147617', ops: 4, dev: 5 }
};

/**
 * A solo project's chat is «<Name> · Ops»; a team forum is just the name — the
 * forum already carries its own «Ops»/«Dev» tabs, so the chat's own title
 * does not need to repeat the word. A chat shared by several repositories of
 * one product carries the product's name in `title`, and every row sharing
 * that chat repeats it, so any of them answers with the same title. The real
 * Telegram chat title and this function must agree: the avatar scripts and the
 * name-drift check both read it through `notify routes --json`, not by asking
 * Telegram.
 */
export const chatTitle = (p: Project): string =>
  ROUTES[p].title ?? (ROUTES[p].ops === undefined ? `${DISPLAY[p]} · Ops` : DISPLAY[p]);

export type Target = { chat: string; thread?: number; silent: boolean };

/**
 * Where an event goes. Everything goes to its own project's "Ops" tab; a
 * red one arrives there too, just with sound.
 *
 * There is no separate "incidents" topic any more: it made sense while the
 * forum was shared across all projects. Now every project has its own
 * group, and an incident is visible in that same feed — there is no reason
 * to funnel them into one place, and the sound already tells an incident
 * apart from an ordinary message.
 */
export const targets = (e: NotifyEvent): Target[] => {
  const forum = ROUTES[e.project];

  // An unknown project — a typo in `--project`, or a project forgotten in
  // ROUTES. We return an empty list rather than throw: a notification has
  // no right to bring down the deploy or cron job that called it (in bash
  // with `set -e` a throw here would be fatal).
  if (!forum) {
    console.error(`[notify] unknown project "${e.project}" — known: ${Object.keys(ROUTES).join(', ')}`);

    return [];
  }

  return [{ chat: forum.chat, ...(forum.ops === undefined ? {} : { thread: forum.ops }), silent: severity(e) === 'info' }];
};
