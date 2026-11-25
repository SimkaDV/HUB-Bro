@echo off
rem Сервер данных avito на Windows. Ключ доступа — первая строка data\server\access-key.txt (нет файла — без ключа).
rem Лог — data\server\data.log.
cd /d "%~dp0..\.."
set PORT=8791
set HOST=127.0.0.1
set STORE=%~dp0..\store
set ACCESS_KEY_FILE=%~dp0access-key.txt
"C:\Program Files\nodejs\node.exe" data\server\server.mjs >> "%~dp0data.log" 2>&1
