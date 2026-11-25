# HUB BRO — версия gri_version: установка на компьютер

Кабинет для продажи джинсов через Авито (склад, заказы, комплектация, печать бирок) вместе с **сервером данных** —
всё в этой ветке, ничего больше не нужно. Ставится на компьютер с **Windows 10/11**, который будет «сервером»:
он хранит данные, а кабинет открывается в браузере — на нём же и с других компьютеров и телефонов.

```
HUB-Bro (ветка gri_version)
├── web/        кабинет (React) — собирается в web\dist
├── server/     сервер кабинета (порт 8790): страницы, /avito → Авито, /api → сервер данных; значок в трее
├── data/       сервер данных (порт 8791) и формат данных; сами данные — data\store (создаётся при первом запуске)
├── extension/  расширение Chrome: заказы из кабинета Авито → в кабинет
└── docs/       как всё устроено (ARCHITECTURE.md, WAREHOUSE.md, ORDERS.md, …)
```

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

## Обновление

```powershell
cd $dir
git pull
cd web; npm ci; npm run build
schtasks /End /TN HubBroServer; schtasks /Run /TN HubBroServer
```
Данные (`data\store`), ключ доступа и логи при обновлении не трогаются. Если обновилось расширение — повторить шаг 7
(скопировать заново и вписать адрес) и нажать «Обновить» у расширения в `chrome://extensions`.

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
- **Папку не удалить** — хаб работает от SYSTEM и держит файлы: сначала
  `schtasks /End /TN HubBroServer; schtasks /Delete /TN HubBroServer /F; schtasks /Delete /TN HubBroTray /F`,
  затем остановить `node.exe` в Диспетчере задач и удалить папку.
