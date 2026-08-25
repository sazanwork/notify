export type { EventType, NotifyEvent, Project } from './events.ts';
export { severity } from './events.ts';
export { notify, sendReport } from './send.ts';
// `render` наружу — чтобы отправитель мог положить на диск РОВНО ту карточку,
// которая уехала, а не свою вторую версию текста. Сборка копии вручную уже
// расходилась с отправленным.
export { render } from './render.ts';
export type { SendResult } from './send.ts';
