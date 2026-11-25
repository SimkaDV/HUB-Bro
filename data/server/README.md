# Сервер данных avito

Единственная дверь к данным магазина: бот и HUB BRO читают и пишут только через него. Node 20+, без зависимостей.
Формат — [../schema/FORMAT.md](../schema/FORMAT.md).

```
data/
├── schema/   FORMAT.md, validate.mjs (проверка, её вызывает сервер), migrate-legacy.mjs (старые данные → v1)
├── server/   server.mjs, run-data.cmd (Windows), этот README
└── store/    данные клиента: catalog.json, stock.json, …, files/, _meta.json, backups/   (у каждого клиента свои)
```

## Запуск

```bash
node data/server/server.mjs                                  # 127.0.0.1:8791, данные в data/store, без ключа
PORT=8791 HOST=127.0.0.1 STORE=/path ACCESS_KEY_FILE=/path/key.txt node data/server/server.mjs
```
Windows — `data\server\run-data.cmd` (порт 8791, ключ из `data\server\access-key.txt`, лог `data\server\data.log`).

Слушает только `127.0.0.1`. Снаружи — через HUB BRO (он проксирует `/api/*` сюда) или `tailscale serve` (когда хаба нет).

## API

Ключ доступа — заголовок `x-hubbro-key` (если задан). Без ключа отвечает только `/api/health`.

| Запрос | Ответ |
|---|---|
| `GET /api/health` | `{ ok, version: { catalog: 1, … } }` |
| `GET /api/state` | `{ revs: { catalog: 3, stock: 7, files: 2 } }` — опрашивать раз в 15–60 с |
| `GET /api/state?key=K` | `{ value, rev, savedAt }`. Файла ещё нет — пустой по формату, `rev: 0` |
| `PUT /api/state?key=K` `{ value, baseRev }` | `{ rev, savedAt, warnings }` · 409 `{ conflict, value, rev, savedAt }` — на сервере новее · 422 `{ errors, warnings }` — не по формату |
| `GET /api/files` | `{ files: [{ name, size }] }` |
| `GET /api/files/NAME` | байты |
| `PUT /api/files/NAME` (тело — байты) | `{ name, size, rev }`. Только .jpg .jpeg .png .webp .heic .gif .pdf, до 15 МБ |
| `DELETE /api/files/NAME` | `{ rev }` |

`K` ∈ `catalog stock orders listings printBatches shop hub log`.

**Как писать:** взять `value` и `rev`, поменять своё, отправить `{ value, baseRev: rev }`. 409 — взять `value` из ответа,
применить свою правку заново, отправить с новым `rev`. Файл фото сначала загрузить (`PUT /api/files/…`), потом сослаться
на него в `catalog`.

## Надёжность

- Запись атомарная (временный файл → переименование).
- Перед первым изменением за день — копия всех JSON в `store/backups/ГГГГ-ММ-ДД/`; заменённые и удалённые картинки
  тоже попадают туда. Хранится 30 дней.
- Неправильные данные не записываются (422), ссылки на то, чего ещё нет, — только предупреждения.

## Новый клиент / перенос

```bash
node data/schema/migrate-legacy.mjs --out data/store --bot <папка бота> [--hub <папка hubbro.*.json>]
```
Без `--hub` — магазин «только бот» (`stockSource: manual`). Пустой магазин — просто запустить сервер на пустой `store/`.
