@echo off
rem Запуск HUB BRO (задача планировщика "HubBroServer", при включении компьютера).
rem Сначала поднимает сервер данных (data\server\run-data.cmd, порт 8791), если он ещё не запущен, потом сам хаб:
rem отдаёт кабинет (web\dist), проксирует /avito к Авито и /api к серверу данных. Ключ доступа проверяет сервер данных.
rem Где data: рядом с хабом (папка avito: avito\data + avito\hub-bro) или внутри хаба (ветка gri_version: hub-bro\data).
rem Лог хаба — server\server.log, сервера данных — data\server\data.log.
cd /d "%~dp0.."
set "DATA_RUN=%~dp0..\..\data\server\run-data.cmd"
if not exist "%DATA_RUN%" set "DATA_RUN=%~dp0..\data\server\run-data.cmd"
netstat -ano | findstr /R /C:"127.0.0.1:8791 .*LISTENING" >nul
if errorlevel 1 (
  powershell -NoProfile -Command "Start-Process -WindowStyle Hidden -FilePath '%DATA_RUN%'"
  powershell -NoProfile -Command "for ($i=0; $i -lt 20; $i++) { if (Get-NetTCPConnection -LocalPort 8791 -State Listen -ErrorAction SilentlyContinue) { break }; Start-Sleep -Milliseconds 250 }"
)
set PORT=8790
set HOST=127.0.0.1
set DATA_URL=http://127.0.0.1:8791
"C:\Program Files\nodejs\node.exe" server\server.mjs >> "%~dp0server.log" 2>&1
