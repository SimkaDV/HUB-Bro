// Плашка HUB BRO на странице заказов Авито: «Посчитать» — сколько заказов в каждой группе, галочки — какие
// группы собрать, «Собрать отмеченные» — пачка в кабинет (фон передаёт или держит до открытия), «Скопировать» —
// запасной путь. Настройки (группы, считать сразу, дочитывать товары) хранятся в расширении.

(async () => {
  if (document.getElementById("hubbro-panel")) return;
  const hub = globalThis.__hubbro;
  const prefs = await hub.settings();

  const el = (tag, css, text) => {
    const n = document.createElement(tag);
    if (css) n.style.cssText = css;
    if (text !== undefined) n.textContent = text;
    return n;
  };
  const BTN = "padding:8px 12px;border:none;border-radius:10px;background:#fff;color:#1c1c1c;font:inherit;font-weight:600;cursor:pointer";
  const LINK = "padding:0;border:none;background:none;color:#fff;opacity:.7;font:inherit;font-size:12px;text-decoration:underline;cursor:pointer";
  const ROW = "display:flex;align-items:center;gap:8px;margin-top:6px;cursor:pointer";

  const panel = el(
    "div",
    "position:fixed;right:16px;bottom:16px;z-index:2147483647;width:300px;padding:12px;border-radius:16px;background:#1c1c1c;color:#fff;font:14px/1.35 system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.25)",
  );
  panel.id = "hubbro-panel";

  const head = el("div", "display:flex;justify-content:space-between;align-items:center");
  const title = el("div", "font-weight:700", "HUB BRO");
  const fold = el("button", LINK, prefs.collapsed ? "развернуть" : "свернуть");
  head.append(title, fold);

  const body = el("div", prefs.collapsed ? "display:none" : "");

  // Группы с галочками и счётчиками.
  const counts = {};
  const boxes = {};
  const groupsBox = el("div", "margin-top:6px");
  for (const g of hub.GROUPS) {
    const row = el("label", ROW);
    const box = el("input");
    box.type = "checkbox";
    box.checked = prefs.groups.includes(g.id);
    const name = el("span", "flex:1", g.label);
    const n = el("span", "opacity:.7;font-variant-numeric:tabular-nums", "—");
    row.append(box, name, n);
    groupsBox.append(row);
    boxes[g.id] = box;
    counts[g.id] = n;
  }

  const option = (text, checked) => {
    const row = el("label", ROW + ";font-size:12px;opacity:.85");
    const box = el("input");
    box.type = "checkbox";
    box.checked = checked;
    row.append(box, el("span", "", text));
    return { row, box };
  };
  const auto = option("Считать сразу при открытии страницы", prefs.autoCount);
  const items = option("Дочитывать товары и у остальных групп (дольше)", prefs.readItems);

  const status = el("div", "margin-top:8px;opacity:.85");
  const buttons = el("div", "display:flex;flex-wrap:wrap;gap:8px;margin-top:8px");
  const countBtn = el("button", BTN, "Посчитать");
  const collectBtn = el("button", BTN, "Собрать отмеченные");
  const copyBtn = el("button", BTN + ";display:none", "Скопировать");
  buttons.append(countBtn, collectBtn, copyBtn);

  const footer = el("div", "display:flex;justify-content:space-between;gap:8px;margin-top:8px;font-size:12px;opacity:.7");
  const stats = el("span");
  const journalBtn = el("button", LINK, "журнал запросов");
  footer.append(stats, journalBtn);

  body.append(groupsBox, auto.row, items.row, status, buttons, footer);
  panel.append(head, body);
  document.body.append(panel);

  const chosen = () => hub.GROUPS.map((g) => g.id).filter((id) => boxes[id].checked);
  const showStats = (s) => {
    if (s) stats.textContent = `запросов ${s.requests} · 429: ${s.limited}${s.waitedSec ? ` · ждали ${s.waitedSec} с` : ""}`;
  };
  const busy = (on) => {
    countBtn.disabled = on;
    collectBtn.disabled = on || chosen().length === 0;
  };
  const updateCollectLabel = () => {
    const known = chosen().every((id) => counts[id].textContent !== "—");
    const n = chosen().reduce((sum, id) => sum + (Number(counts[id].textContent) || 0), 0);
    collectBtn.textContent = known && chosen().length ? `Собрать отмеченные (${n})` : "Собрать отмеченные";
    collectBtn.disabled = chosen().length === 0;
  };

  for (const id of Object.keys(boxes)) {
    boxes[id].addEventListener("change", () => {
      hub.saveSettings({ groups: chosen() });
      updateCollectLabel();
    });
  }
  auto.box.addEventListener("change", () => hub.saveSettings({ autoCount: auto.box.checked }));
  items.box.addEventListener("change", () => hub.saveSettings({ readItems: items.box.checked }));
  fold.addEventListener("click", () => {
    const collapsed = body.style.display !== "none";
    body.style.display = collapsed ? "none" : "";
    fold.textContent = collapsed ? "развернуть" : "свернуть";
    hub.saveSettings({ collapsed });
  });

  async function doCount() {
    busy(true);
    const r = await hub.count((t) => (status.textContent = t));
    busy(false);
    if (!r.ok) {
      status.textContent = r.error;
      return;
    }
    title.textContent = `HUB BRO · ${r.account.name}`;
    for (const [id, n] of Object.entries(r.counts)) counts[id].textContent = String(n);
    status.textContent = "Отметьте, что собрать";
    showStats(r.stats);
    updateCollectLabel();
  }

  let lastBatch = null;

  async function doCollect() {
    busy(true);
    copyBtn.style.display = "none";
    const r = await hub.collect({ groups: chosen(), readItems: items.box.checked }, (t) => (status.textContent = t));
    busy(false);
    showStats(r.stats);
    if (!r.ok) {
      status.textContent = r.error;
      return;
    }
    lastBatch = r.batch;
    copyBtn.style.display = "";
    const n = r.batch.orders.length;
    const res = await chrome.runtime.sendMessage({ type: "deliver", batch: r.batch });
    const rest = r.batch.missingDetails
      ? ` Не дочитал карточки ${r.batch.missingDetails} заказов — нажмите ещё раз через пару минут.`
      : "";
    status.textContent =
      (res?.delivered ? `Собрано ${n}. Передано в кабинет.` : `Собрано ${n}. Кабинет не открыт — передам, когда откроете (или скопируйте).`) + rest;
  }

  countBtn.addEventListener("click", doCount);
  collectBtn.addEventListener("click", doCollect);

  const copy = async (text, done) => {
    try {
      await navigator.clipboard.writeText(text);
      status.textContent = done;
    } catch {
      status.textContent = "Не получилось скопировать";
    }
  };
  copyBtn.addEventListener("click", () => {
    if (lastBatch) copy(JSON.stringify(lastBatch), "Скопировано. Вставьте в кабинете: Настройки → Расширение Авито");
  });
  journalBtn.addEventListener("click", async () => {
    const { journal } = await chrome.storage.local.get("journal");
    if (!journal) status.textContent = "Журнала ещё нет — посчитайте или соберите";
    else copy(JSON.stringify(journal), `Журнал скопирован: ${journal.what}, запросов ${journal.requests}, 429: ${journal.limited}`);
  });

  updateCollectLabel();
  // Вкладку, открытую фоном для кнопки из кабинета, сами не считаем — там сбор уже идёт.
  if (prefs.autoCount && !document.hidden) doCount();
  else status.textContent = "Нажмите «Посчитать», чтобы увидеть, сколько заказов в каждой группе";
})();
