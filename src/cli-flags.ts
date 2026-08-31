/**
 * Every flag name the CLI can read. It exists for one reason: a typo in a
 * flag name used to be ignored. `--noto=...` instead of `--note=...` made a
 * card with a missing field and exited with code zero — the owner got a
 * cut-down message, and the task that called it thought everything was fine.
 *
 * The list is closed and a test checks it: the test pulls every name that
 * `one`/`num`/`pairs` reads out of this same file, and requires each one to
 * be here. The list and the code cannot drift apart without the test seeing it.
 */
export const KNOWN_FLAGS: ReadonlySet<string> = new Set([
  'action', 'actor', 'assignee', 'author', 'body', 'branch', 'commit',
  'id', 'opened', 'reason', 'workdir',
  'check', 'command', 'command-note', 'commit-author', 'commit-body', 'commit-title', 'commit-url',
  'detail', 'detail-label',
  'expected', 'filename', 'item',
  'item-group', 'job', 'key', 'last-seen', 'line', 'logs', 'note',
  'aside', 'number', 'path', 'period', 'project', 'reviewer', 'stat', 'status',
  'target', 'title', 'url', 'via', 'workflow-name', 'workflow-url',
  // Flags with no value. They live here too, so parsing and the list do not drift apart.
  'json', 'recovered', 'dry-run'
]);
