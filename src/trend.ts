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
 *   trend(210, 207)        → '207 / 210 ▲3'
 *   trend(202, 207)        → '207 / 202 ▼5'
 *   trend(0, 0)            → '0 / 0 ='
 *   trend(37)              → '37'          nothing to compare to, so no mark
 *   trend(4.4, 3.6, '%')   → '3.6% / 4.4% ▲0.8'
 *
 * Both numbers are printed, old first, new second — left is what it was,
 * right is what it became. The owner read `51 ▲5` first and asked what the 5
 * was — the new value or the old one. Neither: it was the distance between
 * two numbers, one of which the card never showed. Once both were on the
 * card the owner asked for THIS order specifically, so a reader can read the
 * row left to right as a sentence: was, became, and by how much.
 *
 * The rule the owner asked for, in one line: where there is data to compare
 * against, the arrow is printed; where there is none, nothing is printed —
 * never a sign that only looks like a comparison.
 */

/** Integers stay integers; anything else keeps one decimal. */
const fmt = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export const trend = (now: number, was?: number, unit = ''): string => {
  const head = `${fmt(now)}${unit}`;

  if (was === undefined || !Number.isFinite(was)) {
    return head;
  }

  const pair = `${fmt(was)}${unit} / ${head}`;

  // Equality is judged on the printed digits, not the raw numbers: `4.44` and
  // `4.46` round to different labels (`4.4%` / `4.5%`), and printing `=` next
  // to two different numbers reads as a lie no threshold on the raw values
  // can prevent.
  if (fmt(now) === fmt(was)) {
    return `${pair} =`;
  }

  // The diff is computed from the two PRINTED numbers, not the raw ones: a
  // diff of the raw values can round to `0.0` even when the printed pair
  // reads `4.4% / 4.5%` — the arrow would show movement of nothing next to
  // two numbers that are visibly different.
  const diff = Number(fmt(now)) - Number(fmt(was));
  return diff > 0 ? `${pair} ▲${fmt(Math.abs(diff))}` : `${pair} ▼${fmt(Math.abs(diff))}`;
};
