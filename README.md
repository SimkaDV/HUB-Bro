# HUB BRO — версия gri_version: установка на компьютер

Кабинет для продажи джинсов через Авито (склад, заказы, комплектация, печать бирок) вместе с **сервером данных** —
всё в этой ветке, ничего больше не нужно. Ставится на компьютер с **Windows 10/11** или **Mac**, который будет
«сервером»: он хранит данные, а кабинет открывается в браузере — на нём же и с других компьютеров и телефонов.

- **Windows** — шаги 1–8 ниже.
- **Mac** — раздел [«Установка на Mac»](#установка-на-mac).
- **Как устроены данные** — раздел [«Формат данных»](#формат-данных).

```
HUB-Bro (ветка gri_version)
├── web/        кабинет (React) — собирается в web\dist
├── server/     сервер кабинета (порт 8790): страницы, /avito → Авито, /api → сервер данных; значок в трее
├── data/       сервер данных (порт 8791) и формат данных; сами данные — data\store (создаётся при первом запуске)
├── extension/  расширение Chrome: заказы из кабинета Авито → в кабинет
└── docs/       как всё устроено (ARCHITECTURE.md, WAREHOUSE.md, ORDERS.md, …)
```

## Установка на Windows

Команды ниже — в **PowerShell от имени администратора** (Пуск → PowerShell → правой кнопкой → «Запуск от имени
администратора»), если не сказано другое.

**Папка установки** задаётся один раз в начале и дальше подставляется в команды сама — любая, без русских букв и
пробелов в пути. **В каждом новом окне PowerShell** сначала снова выполнить эту строку:
```powershell
$dir = "C:\HUB-Bro"
```

## 1. Что поставить один раз

**Node.js 20 или новее** (если `node -v` уже показывает v20+ — пропустить):
```powershell
winget install OpenJS.NodeJS.LTS
```
**Git** (если `git --version` уже работает — пропустить):
```powershell
winget install Git.Git
```
После установки **закрыть и заново открыть** PowerShell (и снова `$dir = …`), чтобы `node` и `git` нашлись. Если
`winget` пишет, что программа уже установлена, а команда всё равно не находится, — тоже просто открыть PowerShell заново.
Если `winget` не работает — обновить «Установщик приложений» (App Installer) в Microsoft Store или скачать с
https://nodejs.org и https://git-scm.com.

## 2. Код

```powershell
git clone -b gri_version https://github.com/SimkaDV/HUB-Bro.git $dir
cd $dir\web
npm ci
npm run build
```
Последняя команда пишет `✓ built` — кабинет собран в `web\dist`.

## 3. Сервер данных: ключ доступа и магазин

Ключ доступа — случайная строка; её спросит кабинет один раз в каждом браузере:
```powershell
cd $dir
node -e "require('fs').writeFileSync('data/server/access-key.txt', require('crypto').randomBytes(24).toString('base64url'))"
```
Магазин (название поменять на своё; наличие считается по складу):
```powershell
node --input-type=module -e "import {empty} from './data/schema/validate.mjs'; import fs from 'node:fs'; fs.mkdirSync('data/store',{recursive:true}); fs.writeFileSync('data/store/shop.json', JSON.stringify({...empty('shop'), name:'Название магазина', stockSource:'warehouse'}))"
```

## 4. Первый запуск и проверка

```powershell
& "$dir\server\run-server.cmd"
```
Окно остаётся занятым — это нормально (сервер работает, пока оно открыто). Открыть в браузере
**http://127.0.0.1:8790**, ввести ключ доступа — показать его (в другом окне PowerShell, после `$dir = …`):
`Get-Content $dir\data\server\access-key.txt`. Если склад открылся — всё работает; **закрыть окно с сервером**
(дальше он будет запускаться сам, два сразу не уживутся).

## 5. Автозапуск при включении компьютера

Хаб и сервер данных запускаются сами, без окна, даже если никто не вошёл в Windows:
```powershell
schtasks /Create /TN HubBroServer /TR "$dir\server\run-server.cmd" /SC ONSTART /RU SYSTEM /F
schtasks /Run /TN HubBroServer
```
Через ~10 секунд http://127.0.0.1:8790 снова открывается.

**Значок HUB BRO в трее** (зелёный — работает; меню: открыть кабинет, выключить / включить и перезапустить хаб, логи) —
при входе пользователя в Windows. Команду выполнить **от того пользователя, который сидит за компьютером**:
```powershell
$me = [Security.Principal.WindowsIdentity]::GetCurrent().Name
Register-ScheduledTask -TaskName HubBroTray -Force -Principal (New-ScheduledTaskPrincipal -UserId $me -LogonType Interactive) `
  -Trigger (New-ScheduledTaskTrigger -AtLogOn -User $me) `
  -Action (New-ScheduledTaskAction -Execute "$env:WINDIR\System32\wscript.exe" -Argument "`"$dir\server\hub-tray.vbs`"") `
  -Settings (New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit 0)
Start-ScheduledTask -TaskName HubBroTray
```
Значок «H» появится справа внизу (или под стрелкой «^»).

## 6. Доступ с других компьютеров и телефонов, печать бирок (Tailscale)

Без этого кабинет открывается только на самом этом компьютере. Печать бирок по USB работает только по **HTTPS**.

1. Аккаунт Tailscale (https://login.tailscale.com/start) → в админке **DNS** → включить **MagicDNS** и **HTTPS Certificates**.
2. Установить Tailscale на этот компьютер и войти в аккаунт (если `& "C:\Program Files\Tailscale\tailscale.exe" status` уже работает — пропустить):
   ```powershell
   winget install Tailscale.Tailscale
   ```
3. HTTPS-адрес для кабинета (знак `&` в начале обязателен):
   ```powershell
   & "C:\Program Files\Tailscale\tailscale.exe" serve --bg 8790
   ```
   Команда покажет адрес вида `https://<имя-компьютера>.<сеть>.ts.net` — это адрес кабинета.
4. На других компьютерах и телефонах — приложение Tailscale, вход в **тот же** аккаунт, открыть этот адрес.

## 7. Расширение Chrome (заказы из кабинета Авито)

На компьютере, где входят в Авито. Расширение **копируется** в отдельную постоянную папку, адрес кабинета вписывается
**в копию** (папку с кодом не трогать — иначе обновление через `git pull` откажется работать):
1. Скопировать (папку назначения можно выбрать свою):
   ```powershell
   $ext = "$env:USERPROFILE\Documents\HUB BRO extension"
   Copy-Item "$dir\extension" $ext -Recurse -Force
   ```
2. Вписать в копию адрес кабинета из шага 6:
   ```powershell
   node "$dir\extension\set-hub.mjs" https://<имя-компьютера>.<сеть>.ts.net $ext
   ```
3. Chrome → `chrome://extensions` → справа вверху «Режим разработчика» → «Загрузить распакованное расширение» → папка `$ext`.
   Папку потом не удалять и не перемещать: Chrome берёт расширение прямо из неё.
4. Войти в Авито в этом же Chrome. Проверка: кабинет → «Настройки» → «Расширение Авито» — «На связи».

Подробно — `docs/EXTENSION.md`.

## 8. Дальше в кабинете

- **Настройки → Авито**: Client ID и Client secret (для объявлений).
- **Склад → Настройки → Категории / Модели**, затем **Размеры**: у каждой категории свои буквы размеров (30 → M).
- **Склад → «+ Поставка»**: остатки.
- **Объявления**: привязать каждое объявление к модели склада.

## Установка на Mac

Всё то же, что на Windows, но команды — в **Терминале** (Программы → Утилиты → Терминал), автозапуск — через
**launchd**, а значка в трее на Mac нет (он сделан для Windows). Mac должен не засыпать: **Системные настройки →
Аккумулятор / Энергосбережение → «Не переводить в режим сна автоматически, когда дисплей выключен»** (на ноутбуке —
держать его на зарядке). Хаб запускается при входе в систему, поэтому пользователь должен оставаться в системе.

Папка установки — один раз в каждом новом окне Терминала:
```bash
dir="$HOME/HUB-Bro"
```

**M1. Node.js 20+ и Git.** Если `node -v` показывает v20+ и `git --version` работает — пропустить. Иначе через
Homebrew (https://brew.sh):
```bash
brew install node git
```
(или Node.js — установщиком с https://nodejs.org, Git — `xcode-select --install`).

**M2. Код:**
```bash
git clone -b gri_version https://github.com/SimkaDV/HUB-Bro.git "$dir"
cd "$dir/web" && npm ci && npm run build
```

**M3. Ключ доступа и магазин** (название — своё):
```bash
cd "$dir"
node -e "require('fs').writeFileSync('data/server/access-key.txt', require('crypto').randomBytes(24).toString('base64url'))"
node --input-type=module -e "import {empty} from './data/schema/validate.mjs'; import fs from 'node:fs'; fs.mkdirSync('data/store',{recursive:true}); fs.writeFileSync('data/store/shop.json', JSON.stringify({...empty('shop'), name:'Название магазина', stockSource:'warehouse'}))"
```

**M4. Первый запуск и проверка:**
```bash
"$dir/server/run-server.sh"
```
Окно занято — это нормально. Открыть **http://127.0.0.1:8790**, ввести ключ (показать — в другом окне Терминала:
`dir="$HOME/HUB-Bro"; cat "$dir/data/server/access-key.txt"`). Если склад открылся — остановить: в этом окне **Ctrl+C**, затем
`pkill -f "$dir/data/server/server.mjs"` (сервер данных работает отдельно).

**M5. Автозапуск** (при входе в систему, сам поднимается, если упал):
```bash
mkdir -p ~/Library/LaunchAgents
cat > ~/Library/LaunchAgents/com.hubbro.server.plist <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.hubbro.server</string>
  <key>ProgramArguments</key><array><string>/bin/bash</string><string>$dir/server/run-server.sh</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
</dict></plist>
EOF
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.hubbro.server.plist
```
Через пару секунд http://127.0.0.1:8790 снова открывается. Управление:
- **перезапустить** (хаб и сервер данных): `pkill -f "$dir/data/server/server.mjs"; launchctl kickstart -k gui/$(id -u)/com.hubbro.server`
- **выключить**: `launchctl bootout gui/$(id -u)/com.hubbro.server; pkill -f "$dir/data/server/server.mjs"`
- **включить снова**: `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.hubbro.server.plist`

**M6. Tailscale и HTTPS** — как шаг 6 для Windows: аккаунт, MagicDNS и HTTPS Certificates; Tailscale для Mac —
https://tailscale.com/download/mac (войти в аккаунт). Адрес кабинета:
```bash
/Applications/Tailscale.app/Contents/MacOS/Tailscale serve --bg 8790
```
(если Tailscale ставили через Homebrew — просто `tailscale serve --bg 8790`).

**M7. Расширение Chrome** — копия и адрес, затем «Загрузить распакованное» как в шаге 7:
```bash
ext="$HOME/Documents/HUB BRO extension"
cp -R "$dir/extension" "$ext"
node "$dir/extension/set-hub.mjs" https://<имя-компьютера>.<сеть>.ts.net "$ext"
```

**Обновление на Mac:**
```bash
cd "$dir" && git pull && cd web && npm ci && npm run build
pkill -f "$dir/data/server/server.mjs"; launchctl kickstart -k gui/$(id -u)/com.hubbro.server
```
Логи — те же файлы: `server/server.log`, `data/server/data.log` (открыть: `open -a TextEdit "$dir/server/server.log"`).

## Обновление (Windows)

```powershell
cd $dir
git pull
cd web; npm ci; npm run build
```
Перезапуск — хаб **и сервер данных** (сервер данных работает отдельным процессом: `schtasks /End` его не
останавливает, без второй строки он остался бы на старом коде до перезагрузки):
```powershell
schtasks /End /TN HubBroServer
Get-CimInstance Win32_Process -Filter "name='node.exe'" | Where-Object { $_.CommandLine -match 'server\\server\.mjs' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
schtasks /Run /TN HubBroServer
```
То же самое делает значок в трее → «Перезапустить хаб».
Данные (`data\store`), ключ доступа и логи при обновлении не трогаются. Если обновилось расширение — повторить шаг 7
(скопировать заново и вписать адрес) и нажать «Обновить» у расширения в `chrome://extensions`.

## Формат данных

Все данные магазина — обычные **JSON-файлы** в `data/store/` (по одному на тему). Полное описание каждого поля —
[`data/schema/FORMAT.md`](data/schema/FORMAT.md), проверка — [`data/schema/validate.mjs`](data/schema/validate.mjs).

```
data/store/
├── catalog.json        товары, категории, шкала размеров (+ буквы размеров у каждой категории)
├── stock.json          поставки и остатки по размерам, джинсы под заказами
├── orders.json         заказы Авито
├── listings.json       объявления Авито и их привязка к товарам
├── printBatches.json   партии печати бирок
├── shop.json           магазин: название, откуда наличие, время отправки, порядок служб доставки
├── hub.json            настройки экрана склада и черновики поставок
├── log.json            история изменений настроек и каталога (новые сверху, до 2000)
├── files/              фото товаров и картинки размерных сеток
├── _meta.json          служебное: версия и время сохранения каждого файла
└── backups/ГГГГ-ММ-ДД/ копия всех файлов перед первым изменением за день (30 дней)
```

**Главные правила**
- В каждом файле есть `"format"` (имя файла) и `"version"` (версия формата, сейчас `1`).
- **Связи — только по id**, названия можно менять без последствий: заказ → товар по `productId`, объявление →
  товар по `productId`, товар → категория по `categoryId`, поставка → товар по `productId`.
- id товаров и категорий — латиница из названия (`klesh`, `jeans`), не меняются; id заказов и объявлений — номера Авито.
- **Размер — номер строкой** (`"30"`). Буквы — отдельно: у **каждой категории своё соответствие**
  (`categories[].labels`: `{"30": "M"}`), запасные — в шкале `sizeScale`. Показывается «30 (M)».
- Даты: момент — ISO (`2026-11-25T09:45:41.408Z`), день — `ГГГГ-ММ-ДД`. Деньги — рубли числом.
- Остаток не правится числом — только движениями (поставка, резерв под заказ, отмена поставки).

**Пример `catalog.json`** (сокращённо):
```json
{
  "format": "catalog", "version": 1,
  "sizeScale": [ { "size": "30", "label": "" }, { "size": "31", "label": "" } ],
  "categories": [
    { "id": "jeans", "name": "Джинсы", "sizes": ["30", "31"],
      "thresholds": { "lowMax": 5, "midMax": 10 }, "labels": { "30": "M", "31": "L" } }
  ],
  "products": [
    { "id": "klesh", "name": "Клёш", "categoryId": "jeans", "code": "КЛ", "sizes": ["30", "31"],
      "match": [], "description": { "material": null, "composition": null, "density": null, "legOpening": null },
      "photos": [], "chart": null, "availability": { "inStock": true, "outSizes": [] } }
  ]
}
```

**Пример `stock.json`** — одна поставка и остатки по ней (2 шт. 30-го, 1 шт. 31-го):
```json
{
  "format": "stock", "version": 1,
  "batches": [
    { "id": "b1", "productId": "klesh", "name": "Клёш 25.11", "date": "2026-11-25", "from": "Садовод",
      "total": 3000, "price": 1000, "delivered": [ { "size": "30", "qty": 2 }, { "size": "31", "qty": 1 } ],
      "addedAt": "2026-11-25T09:00:00.000Z" }
  ],
  "products": {
    "klesh": {
      "30": { "stock": [ { "batchId": "b1", "qty": 2 } ], "units": [] },
      "31": { "stock": [ { "batchId": "b1", "qty": 1 } ], "units": [] }
    }
  }
}
```

**Как читать и менять.** Файлы **не правятся руками** — только через сервер данных (его используют кабинет и любые
свои скрипты). Он проверяет формат (не по формату — ошибка 422) и не даёт двум программам затереть правки друг друга
(кто сохранил раньше — у того и правда; второй получает 409 и свежие данные):

| Запрос | Ответ |
|---|---|
| `GET /api/state` | версии всех файлов: `{ "revs": { "catalog": 3, … } }` |
| `GET /api/state?key=catalog` | `{ "value": <файл>, "rev": 3, "savedAt": "…" }` |
| `PUT /api/state?key=catalog` с телом `{ "value": …, "baseRev": 3 }` | `{ "rev": 4 }` · 409 — на сервере новее · 422 — не по формату |
| `GET/PUT/DELETE /api/files/<имя>` | фото и картинки |

Адрес — `http://127.0.0.1:8791` (на самом сервере) или через кабинет `https://<адрес кабинета>/api/…`;
ключ доступа — заголовок `x-hubbro-key` (из `data/server/access-key.txt`). Подробно — [`data/server/README.md`](data/server/README.md).

## Где что лежит и бэкапы

- Данные магазина — `$dir\data\store\` (`catalog.json`, `stock.json`, `orders.json`, …). **Не редактировать
  руками**: только через кабинет (сервер данных проверяет формат и следит, чтобы правки не затирали друг друга).
- Бэкап делается сам: перед первым изменением за день — копия в `data\store\backups\ГГГГ-ММ-ДД\`, хранится 30 дней.
- Логи: хаб — `server\server.log`, сервер данных — `data\server\data.log`, значок — `server\hub-tray.log`
  (удобнее открывать из меню значка: «Открыть лог…»).
- Проверка, что сервер данных жив: `curl.exe http://127.0.0.1:8791/api/health` → `{"ok":true,…}`.

## Если что-то не так

- **Кабинет не открывается (ошибка 502)** — хаб не запущен: `schtasks /Run /TN HubBroServer` или значок в трее →
  «Включить хаб».
- **«Нужен ключ доступа» и ключ не подходит** — ключ в `data\server\access-key.txt` (строка целиком).
- **PowerShell: unexpected token** у команды, которая начинается с пути в кавычках, — нужен `&` в начале.
- **«Не найден путь» / `$dir` пустой** — в новом окне PowerShell не задана папка: `$dir = "C:\HUB-Bro"` (свою).
- **Путь «не найден»** — буква диска латинская `C`, не русская `С`.
- **`git pull` пишет «local changes would be overwritten»** — в папке с кодом что-то меняли (например, расширение);
  вернуть как было: `git checkout -- .` (данные в `data\store` это не трогает), затем снова `git pull`.
- **Папку не удалить** — хаб и сервер данных работают от SYSTEM и держат файлы: снять задачи и остановить их
  (две строки из «Обновления», затем `schtasks /Delete /TN HubBroServer /F; schtasks /Delete /TN HubBroTray /F`),
  закрыть значок в трее («Убрать значок») и удалить папку.
