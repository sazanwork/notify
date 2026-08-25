/**
 * One number, written the one way every card writes a number.
 *
 * Two report senders each grew their own dialect: one printed `485 ▲207` and
 * `0 =`, the other printed `210 +3` for a real comparison and `+37` for a
 * plain count of what happened today — a plus sign in front of a number that
 * was never compared to anything. Inside a single group `Removed: 3` stood
 * next to `Added: +6`, the same kind of fact in two shapes.
 *
 * So the shape is not a sender's business any more. It lives here, one
 * implementation, and every report calls it:
 *
 *   trend(210, 207)        → '210 / 207 ▲3'
 *   trend(202, 207)        → '202 / 207 ▼5'
 *   trend(0, 0)            → '0 / 0 ='
 *   trend(37)              → '37'          nothing to compare to, so no mark
 *   trend(4.4, 3.6, '%')   → '4.4% / 3.6% ▲0.8'
 *
 * Both numbers are printed, now first and before first. The owner read
 * `51 ▲5` and asked what the 5 was — the new value or the old one. Neither: it
 * was the distance between two numbers, one of which the card never showed.
 *
 * The rule the owner asked for, in one line: where there is data to compare
 * against, the arrow is printed; where there is none, nothing is printed —
 * never a sign that only looks like a comparison.
 */

/** Integers stay integers; anything else keeps one decimal. */
const fmt = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/**
 * Two values that round to the same first decimal are equal: `4.42%` against
 * `4.44%` is not movement, it is noise, and `▲0.0` reads as a lie.
 */
const same = (a: number, b: number): boolean => Math.abs(a - b) < 0.05;

export const trend = (now: number, was?: number, unit = ''): string => {
  const head = `${fmt(now)}${unit}`;

  if (was === undefined || !Number.isFinite(was)) {
    return head;
  }

  const pair = `${head} / ${fmt(was)}${unit}`;

  if (same(now, was)) {
    return `${pair} =`;
  }

  return now > was ? `${pair} ▲${fmt(now - was)}` : `${pair} ▼${fmt(was - now)}`;
};
