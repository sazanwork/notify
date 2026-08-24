/**
 * Каждое имя флага, которое CLI умеет читать. Существует ради одной вещи:
 * опечатка в имени флага раньше просто игнорировалась. `--noto=...` вместо
 * `--note=...` рисовал карточку без причины и выходил нулём — владелец получал
 * обрезанное сообщение, а вызывающая задача считала, что всё хорошо.
 *
 * Список закрытый и проверяется тестом: тест вытаскивает из этого же файла все
 * имена, которые читает `one`/`num`/`pairs`, и требует, чтобы каждое было
 * здесь. Разойтись молча он не может.
 */
export const KNOWN_FLAGS: ReadonlySet<string> = new Set([
  'action', 'actor', 'assignee', 'author', 'body', 'branch', 'commit',
  'commit-body', 'commit-title', 'commit-url', 'detail', 'expected',
  'filename', 'item', 'job', 'key', 'last-seen', 'line', 'logs', 'note',
  'number', 'path', 'period', 'project', 'reviewer', 'stat', 'status',
  'target', 'title', 'url', 'via', 'workflow-name', 'workflow-url',
  // Флаги без значения. Живут здесь же, чтобы разбор и список не разошлись.
  'json', 'recovered', 'dry-run'
]);
