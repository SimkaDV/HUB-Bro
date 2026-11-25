// Фон расширения: передаёт пачки заказов в кабинет HUB BRO и собирает заказы по кнопке из кабинета.
// Описание — docs/EXTENSION.md.

// Где открыт кабинет: сайт на Vercel и дев-сервер. Тот же список — в manifest.json (host_permissions, content_scripts).
const HUB_URLS = ["https://hub-bro.vercel.app/*", "https://taylormomsen.tailccfeb1.ts.net/*", "http://localhost:5173/*"];
const AVITO_URLS = ["https://www.avito.ru/*", "https://m.avito.ru/*"];

const hubTabs = () => chrome.tabs.query({ url: HUB_URLS });

/** Отправляет во все вкладки кабинета. Возвращает, сколько вкладок приняли. */
async function toHub(message) {
  let delivered = 0;
  for (const tab of await hubTabs()) {
    try {
      await chrome.tabs.sendMessage(tab.id, message);
      delivered += 1;
    } catch {
      // Вкладка ещё грузится или без нашего скрипта — пачка дождётся в pending.
    }
  }
  return delivered;
}

/** Пачка ждёт в pending, пока кабинет не подтвердит, что принял её. */
async function deliver(batch) {
  const id = `${batch.collectedAt}-${batch.account.id}`;
  await chrome.storage.local.set({ pending: { id, batch } });
  return toHub({ type: "batch", id, batch });
}

function waitLoaded(tabId) {
  return new Promise((resolve) => {
    const listener = (id, info) => {
      if (id === tabId && info.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
}

let collecting = false;

/**
 * Кнопка из кабинета: собираем во вкладке Авито (там вход продавца) группы, отмеченные на плашке Авито
 * (по умолчанию «Ждут отправки», «Едут», «В ПВЗ»). Нет вкладки — открываем фоном и закрываем.
 */
async function collectFromHub() {
  if (collecting) return { ok: false, error: "Уже собираю" };
  collecting = true;
  let opened = null;
  try {
    let [tab] = await chrome.tabs.query({ url: AVITO_URLS });
    if (!tab) {
      tab = opened = await chrome.tabs.create({ url: "https://www.avito.ru/orders", active: false });
      await waitLoaded(tab.id);
    }
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["avito/collect.js"] });
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: async () => {
        const hub = globalThis.__hubbro;
        const { groups, readItems } = await hub.settings();
        return hub.collect({ groups, readItems }, (text) => chrome.runtime.sendMessage({ type: "progress", text }));
      },
    });
    if (!result?.ok) return result ?? { ok: false, error: "Сбор не вернул ответ" };
    await deliver(result.batch);
    return { ok: true, count: result.batch.orders.length };
  } catch (e) {
    return { ok: false, error: `Не получилось открыть Авито: ${e?.message ?? e}` };
  } finally {
    collecting = false;
    if (opened) chrome.tabs.remove(opened.id).catch(() => {});
  }
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  (async () => {
    switch (msg?.type) {
      case "deliver":
        return { delivered: await deliver(msg.batch) };
      case "progress":
        await toHub({ type: "progress", text: msg.text });
        return {};
      case "collect":
        return collectFromHub();
      case "pending":
        return (await chrome.storage.local.get("pending")).pending ?? null;
      case "ack": {
        const { pending } = await chrome.storage.local.get("pending");
        if (pending?.id === msg.id) await chrome.storage.local.remove("pending");
        return {};
      }
      default:
        return {};
    }
  })().then(reply);
  return true;
});
