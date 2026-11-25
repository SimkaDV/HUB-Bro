// Мост между кабинетом HUB BRO (hub-bro.vercel.app, taylormomsen.tailccfeb1.ts.net или localhost) и фоном расширения: window.postMessage ⇄ chrome.runtime.
// Кабинет пишет { source: "hubbro-page", type }, расширение отвечает { source: "hubbro-ext", type }.

const VERSION = chrome.runtime.getManifest().version;
const toPage = (msg) => window.postMessage({ source: "hubbro-ext", ...msg }, location.origin);

async function sendPending() {
  const pending = await chrome.runtime.sendMessage({ type: "pending" });
  if (pending) toPage({ type: "batch", id: pending.id, batch: pending.batch });
}

window.addEventListener("message", async (e) => {
  if (e.source !== window || e.origin !== location.origin || e.data?.source !== "hubbro-page") return;
  switch (e.data.type) {
    case "hello":
      toPage({ type: "ready", version: VERSION });
      await sendPending();
      break;
    case "collect": {
      const result = await chrome.runtime.sendMessage({ type: "collect" });
      if (!result?.ok) toPage({ type: "error", message: result?.error ?? "Расширение не ответило" });
      break;
    }
    case "ack":
      await chrome.runtime.sendMessage({ type: "ack", id: e.data.id });
      break;
  }
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "batch" || msg?.type === "progress") toPage(msg);
});

// Кабинет мог загрузиться раньше скрипта — объявляемся сами.
toPage({ type: "ready", version: VERSION });
