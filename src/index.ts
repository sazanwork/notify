export type { EventType, NotifyEvent, Project } from './events.ts';
export { severity } from './events.ts';
export { notify, sendReport } from './send.ts';
// `render` is exported so a sender can put on disk EXACTLY the card that was
// sent rather than its own second version of the text. A hand-built copy had
// already drifted from what went out.
export { render } from './render.ts';
// `trend` is exported for the same reason one floor down: the shape of a
// number is the package's, not each sender's. Two report senders had grown two
// dialects for one thing.
export { trend } from './trend.ts';
export type { SendResult } from './send.ts';
