# Грабли — notify

## Указатель

| Грабля | О чём коротко |
|---|---|
| [exit-is-always-zero](#exit-is-always-zero) | CLI всегда выходит 0: уведомление не имеет права уронить вызывающего |
| [thread-id-on-plain-chat](#thread-id-on-plain-chat) | Thread id в соло-чат даёт «message thread not found» |
| [recreated-topic-new-id](#recreated-topic-new-id) | Удалённая тема Telegram получает новый id, старый не оживает |

### exit-is-always-zero

**Код возврата `notify` всегда 0.** Ошибки — в stderr. Watchdog на VPS
читает поток по словам `sent|failed|skipped`; новое слово там его слепит.

Как обходить: не проверять `$?` отправителя; смотреть stderr и карточку в
чате.

### thread-id-on-plain-chat

**Соло-чат без Topics не принимает `message_thread_id`.** Строка в
`ROUTES` и настройка чата должны совпадать: у соло нет поля `ops`.

### recreated-topic-new-id

**Id темы — id её первого сообщения.** Удалили вкладку руками — следующий
id другой. Правка — строка в [`src/routes.ts`](../src/routes.ts), не
«подождать, пока оживёт».
