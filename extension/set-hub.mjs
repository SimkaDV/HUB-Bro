// Добавить адрес кабинета HUB BRO в расширение (три места: manifest.json host_permissions, content_scripts для hub.js,
// HUB_URLS в background.js). Повторный запуск ничего не дублирует. Описание — docs/EXTENSION.md, раздел 4.
//
//   node hub-bro/extension/set-hub.mjs https://client.tailnet.ts.net [папка-расширения]
//
// Папка по умолчанию — та, где лежит этот скрипт. deploy.sh вызывает его для копии расширения конкретного клиента.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const [raw, dirArg] = process.argv.slice(2);
if (!raw || !/^https?:\/\/[a-z0-9.-]+(:\d+)?\/?$/i.test(raw)) {
  console.error("нужен адрес кабинета: https://<имя-компьютера>.<tailnet>.ts.net");
  process.exit(2);
}
const pattern = `${raw.replace(/\/+$/, "")}/*`;
const dir = dirArg ?? dirname(fileURLToPath(import.meta.url));

const manifestPath = join(dir, "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const addTo = (list) => (list.includes(pattern) ? list : [...list, pattern]);
manifest.host_permissions = addTo(manifest.host_permissions ?? []);
const hubScript = (manifest.content_scripts ?? []).find((c) => (c.js ?? []).includes("hub.js"));
if (!hubScript) throw new Error("в manifest.json нет content_scripts с hub.js");
hubScript.matches = addTo(hubScript.matches ?? []);
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

const bgPath = join(dir, "background.js");
const bg = readFileSync(bgPath, "utf8");
const m = bg.match(/const HUB_URLS = \[([^\]]*)\];/);
if (!m) throw new Error("в background.js нет строки const HUB_URLS = [...]");
if (!m[1].includes(`"${pattern}"`)) {
  const items = m[1].trim() ? `${m[1].trim()}, "${pattern}"` : `"${pattern}"`;
  writeFileSync(bgPath, bg.replace(m[0], `const HUB_URLS = [${items}];`));
}
console.log(`расширение (${dir}): адрес ${pattern} прописан`);
