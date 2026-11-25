@echo off
rem Запуск HUB BRO на taylormomsen (задача планировщика "HubBroServer", при включении компа).
rem Сначала поднимает сервер данных avito (avito\data\server\run-data.cmd, порт 8791), если он ещё не запущен,
rem потом сам хаб: отдаёт кабинет (web\dist), проксирует /avito к Авито и /api к серверу данных. Ключ доступа
rem проверяет сервер данных. Лог хаба — server\server.log, сервера данных — avito\data\server\data.log.
cd /d "%~dp0.."
netstat -ano | findstr /R /C:"127.0.0.1:8791 .*LISTENING" >nul
if errorlevel 1 (
  powershell -NoProfile -Command "Start-Process -WindowStyle Hidden -FilePath '%~dp0..\..\data\server\run-data.cmd'"
  powershell -NoProfile -Command "for ($i=0; $i -lt 20; $i++) { if (Get-NetTCPConnection -LocalPort 8791 -State Listen -ErrorAction SilentlyContinue) { break }; Start-Sleep -Milliseconds 250 }"
)
set PORT=8790
set HOST=127.0.0.1
set DATA_URL=http://127.0.0.1:8791
"C:\Program Files\nodejs\node.exe" server\server.mjs >> "%~dp0server.log" 2>&1
