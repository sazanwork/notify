# Архитектура notify

Одиночный пакет. Связи — внутри модулей `src/`, наружу — один секрет
`OPS_BOT_TOKEN` и Telegram Bot API.

| Модуль | Файл | Что делает |
|---|---|---|
| Каталог событий | [`src/events.ts`](../src/events.ts) | Типы, `DISPLAY`, severity. Имя проекта = имя репозитория |
| Маршруты | [`src/routes.ts`](../src/routes.ts) | Единственное место новой строки проекта: chat / ops / dev |
| Рендер | [`src/render.ts`](../src/render.ts) | Карточка в разметке Telegram; форма — [`product/CARD_FORMAT.md`](product/CARD_FORMAT.md) |
| Отправка | [`src/send.ts`](../src/send.ts) | `notify()`; код возврата CLI всегда 0 |
| Тренд | [`src/trend.ts`](../src/trend.ts) | Форма числа в отчёте |
| CLI | [`src/cli.ts`](../src/cli.ts) | Bash и Actions входят сюда |

Публичный вход — [`src/index.ts`](../src/index.ts): `notify`, `render`,
`trend`. Зависимостей рантайма нет; Node 22.18+ исполняет TypeScript
напрямую, npm-релиз собирается в `dist/`.
