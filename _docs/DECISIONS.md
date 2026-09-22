# Решения — notify

## Указатель

| Решение | О чём коротко |
|---|---|
| [forum-per-project](#forum-per-project) | Форум на проект, не общая тема на проект: Telegram не прячет чужие вкладки |
| [typed-events-only](#typed-events-only) | `notify()` принимает объект события, не свободную строку |
| [one-secret](#one-secret) | Секрет один — `OPS_BOT_TOKEN`; chat id живут в коде |

## Действующие решения

### forum-per-project

**У каждого проекта свой форум (или соло-чат); у продукта с людьми — одна вкладка Ops на репозиторий и одна Dev на продукт.**

Почему так: общая группа с темой на проект не умеет закрыть тему от участника.
Сотрудник видел бы все вкладки, и проект жил бы в двух местах. Строка
добавляется только в [`src/routes.ts`](../src/routes.ts).

Затрагивает: [`src/routes.ts`](../src/routes.ts), [`src/events.ts`](../src/events.ts).

---

### typed-events-only

**Карточку нельзя написать «своими словами»: API принимает только `NotifyEvent`.**

Почему так: 18 имён переменных и несколько `jq | curl` уже расходились.
Один рендерер на тип держит каркас. Новый тип — новый вариант union, не
свободное поле.

Затрагивает: [`src/events.ts`](../src/events.ts), [`src/render.ts`](../src/render.ts), [`product/CARD_FORMAT.md`](product/CARD_FORMAT.md).

---

### one-secret

**Chat и topic id — не секрет; без токена бота они бесполезны, поэтому лежат в коде.**

Почему так: иначе «добавить проект» правит три места. Токен — `OPS_BOT_TOKEN`
из vault или GitHub secrets.

Затрагивает: [`src/routes.ts`](../src/routes.ts), [`src/send.ts`](../src/send.ts).
