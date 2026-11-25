#!/bin/bash
# Запуск HUB BRO на Mac (аналог run-server.cmd для Windows). Сначала поднимает сервер данных (порт 8791), если он ещё
# не запущен, потом сам хаб (порт 8790): отдаёт кабинет (web/dist), проксирует /avito к Авито и /api к серверу данных.
# Ключ доступа проверяет сервер данных (data/server/access-key.txt).
# Где data: рядом с хабом (папка avito: avito/data + avito/hub-bro) или внутри хаба (ветка gri_version: hub-bro/data).
# Логи: хаб — server/server.log, сервер данных — data/server/data.log.
# Запускается вручную (./server/run-server.sh) или launchd'ом при входе в систему (README, «Установка на Mac»).
set -u
HUB="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [ -d "$HUB/../data/server" ]; then DATA="$(cd "$HUB/../data" && pwd)"; else DATA="$HUB/data"; fi

# launchd запускает с минимальным PATH — добавляем, где обычно лежит node (Homebrew на Apple Silicon / Intel, установщик)
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
NODE="$(command -v node)" || { echo "$(date '+%F %T') node не найден — поставьте Node.js 20+" >> "$HUB/server/server.log"; exit 1; }

listening() { /usr/sbin/lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }

if ! listening 8791; then
  ( cd "$(dirname "$DATA")" && PORT=8791 HOST=127.0.0.1 STORE="$DATA/store" ACCESS_KEY_FILE="$DATA/server/access-key.txt" \
      nohup "$NODE" "$DATA/server/server.mjs" >> "$DATA/server/data.log" 2>&1 & )
  for _ in $(seq 1 20); do listening 8791 && break; sleep 0.25; done
fi

cd "$HUB"
export PORT=8790 HOST=127.0.0.1 DATA_URL=http://127.0.0.1:8791
exec "$NODE" server/server.mjs >> "$HUB/server/server.log" 2>&1
