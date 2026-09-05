/**
 * Routing "event → where to send." The ONLY place that a new project
 * touches: add a row to `ROUTES` — no new bot, no new secret, no edits in
 * the projects themselves.
 *
 * The scheme: ONE FORUM PER PROJECT, with an "⚙️ Ops" tab (robot
 * notifications) and a "💬 Dev" tab (people's live chat) inside it.
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
import { severity } from './events.ts';

type Forum = {
  /** The id of the project's forum supergroup. */
  chat: string;
  /** The "⚙️ Ops" tab — robots write here. */
  ops: number;
  /**
   * The "💬 Dev" tab — people. The bot does not write here; the field is
   * kept for completeness. Optional: an infrastructure forum has no people
   * and nothing to discuss, and an empty tab would read as a forgotten
   * setting, not as room to grow into.
   */
  dev?: number;
};

export const ROUTES: Record<Project, Forum> = {
  // ops/dev = 22/23, not 3/4: the old tabs were deleted by hand on
  // 27.07.2026, and Telegram removes a topic's messages along with it. A
  // recreated topic gets a NEW id — a topic's id is the id of its first
  // message, it is never reused.
  zabukai: { chat: '-1004299939100', ops: 22, dev: 23 },
  playhub: { chat: '-1004418379613', ops: 3, dev: 4 },
  'game-publisher': { chat: '-1004292453693', ops: 3, dev: 4 },
  'one-q': { chat: '-1004466909784', ops: 3, dev: 4 },
  // No `dev`: the safe is infrastructure, there is no one to discuss it
  // with. Only reports from the weekly check, and only when something
  // broke.
  vault: { chat: '-1004459314999', ops: 3 },
  // Also infrastructure, no `dev`: the daily task digest and the Monday
  // stumbles summary. Before this row, both used to die silently on
  // "unknown project."
  'mac-config': { chat: '-1004442522004', ops: 2 },
  // The owner's corporate project: only its own reports on "what the
  // publish delivered" (ali98x-sentry). No `dev` — the project's team lives
  // in other systems, there are no people here. Until 18.08.2026 reports
  // were getting lost on "unknown project" for weeks.
  alitools: { chat: '-1003904331479', ops: 3 }
};

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

  return [{ chat: forum.chat, thread: forum.ops, silent: severity(e) === 'info' }];
};
