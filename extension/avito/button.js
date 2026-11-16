// Кнопка «Собрать заказы» на странице заказов Авито. Собирает пачку (collect.js), отдаёт её фону —
// тот передаёт в открытый кабинет HUB BRO или держит до его открытия. Запасной путь — «Скопировать».

(() => {
  if (document.getElementById("hubbro-panel")) return;

  const panel = document.createElement("div");
  panel.id = "hubbro-panel";
  panel.style.cssText = [
    "position:fixed",
    "right:16px",
    "bottom:16px",
    "z-index:2147483647",
    "max-width:320px",
    "padding:12px",
    "border-radius:16px",
    "background:#1c1c1c",
    "color:#fff",
    "font:14px/1.35 system-ui,sans-serif",
    "box-shadow:0 8px 24px rgba(0,0,0,.25)",
  ].join(";");

  const button = (text) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = text;
    b.style.cssText =
      "margin-top:8px;margin-right:8px;padding:8px 12px;border:none;border-radius:10px;background:#fff;color:#1c1c1c;font:inherit;font-weight:600;cursor:pointer";
    return b;
  };

  const title = document.createElement("div");
  title.textContent = "HUB BRO";
  title.style.cssText = "font-weight:700";
  const status = document.createElement("div");
  status.style.cssText = "margin-top:4px;opacity:.8";
  const collectBtn = button("Собрать заказы");
  const copyBtn = button("Скопировать");
  copyBtn.style.display = "none";

  panel.append(title, status, collectBtn, copyBtn);
  document.body.append(panel);

  let lastBatch = null;

  collectBtn.addEventListener("click", async () => {
    collectBtn.disabled = true;
    copyBtn.style.display = "none";
    const result = await globalThis.__hubbroCollect((text) => (status.textContent = text));
    collectBtn.disabled = false;
    if (!result.ok) {
      status.textContent = result.error;
      return;
    }
    lastBatch = result.batch;
    copyBtn.style.display = "";
    const n = result.batch.orders.length;
    const res = await chrome.runtime.sendMessage({ type: "deliver", batch: result.batch });
    const rest = result.batch.missingDetails
      ? ` Не дочитал карточки ${result.batch.missingDetails} заказов — нажмите ещё раз через пару минут.`
      : "";
    status.textContent =
      (res?.delivered ? `Собрано ${n}. Передано в кабинет.` : `Собрано ${n}. Кабинет не открыт — передам, когда откроете (или скопируйте).`) + rest;
  });

  copyBtn.addEventListener("click", async () => {
    if (!lastBatch) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(lastBatch));
      status.textContent = "Скопировано. Вставьте в кабинете: Настройки → Расширение Авито";
    } catch {
      status.textContent = "Не получилось скопировать";
    }
  });
})();
