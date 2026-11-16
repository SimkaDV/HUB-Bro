// Сбор заказов из кабинета Авито. Работает на странице avito.ru под входом продавца: ходит во внутренний
// JSON сайта (тот же, что грузит страница заказов) и собирает пачку для кабинета HUB BRO.
// Описание — docs/EXTENSION.md.

if (!globalThis.__hubbroCollect) {
  const ACTIVE = ["waiting_confirmation", "waiting_shipment", "in_transit", "delivered_in_pvz", "payout_wait", "on_return", "disputed"];
  const CLOSED = ["finished", "canceled"];
  /** Закрытые заказы берём за последние 14 дней. */
  const CLOSED_DAYS = 14;
  const MAX_PAGES = 25;
  const PAUSE_MS = 250;
  /** Карточку перечитываем, пока у заказа нет номера отправления и его ещё можно отправить. */
  const NEED_DISPATCH = ["confirmed", "waiting_confirmation"];

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  class CollectError extends Error {}

  async function getJson(url) {
    let res;
    try {
      res = await fetch(url, { credentials: "include", headers: { accept: "application/json" } });
    } catch {
      throw new CollectError("Нет связи с Авито");
    }
    if (res.status === 401 || res.status === 403) throw new CollectError("Войдите в Авито");
    if (!res.ok) throw new CollectError(`Авито ответил ${res.status}`);
    try {
      return await res.json();
    } catch {
      throw new CollectError("Войдите в Авито");
    }
  }

  async function account() {
    const j = await getJson("/web/1/profiles/list?limit=3&withEntities=true");
    const p = j?.result?.profiles?.find((x) => x.isCurrent);
    if (!p) throw new CollectError("Не понял, какой аккаунт Авито открыт");
    return { id: String(p.profileId), name: p.name };
  }

  /** Все страницы одного фильтра. У закрытых останавливаемся, когда вся страница старше 14 дней. */
  async function listByStatus(status, closed, cutoff, onProgress) {
    const out = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      onProgress(`Список: ${status}, страница ${page}`);
      const j = await getJson(`/web/1/orders?page=${page}&limit=20&action=sell&status=${status}`);
      if (!Array.isArray(j.orders)) throw new CollectError("Авито поменял страницу заказов — обновите расширение");
      const fresh = closed ? j.orders.filter((o) => new Date(o.updatedAt) >= cutoff) : j.orders;
      out.push(...fresh);
      if (!j.hasMore || (closed && fresh.length === 0)) break;
      await sleep(PAUSE_MS);
    }
    return out;
  }

  /** Ищет в ответе карточки объект с полем `key`, у которого есть `inner`. */
  function findWith(obj, key, inner) {
    const stack = [obj];
    while (stack.length) {
      const o = stack.pop();
      if (!o || typeof o !== "object") continue;
      if (o[key] && typeof o[key] === "object" && (!inner || o[key][inner] !== undefined)) return o[key];
      for (const k in o) stack.push(o[k]);
    }
    return undefined;
  }

  async function details(orderId) {
    const j = await getJson(
      `/web/2/profile/order?referenceID=${orderId}&templateVersion=0&srcp=orders_list&location=Europe%2FMoscow`,
    );
    const main = j?.result?.content?.main?.params;
    if (!main || !Array.isArray(main.items)) throw new CollectError("Авито поменял карточку заказа — обновите расширение");
    const delivery = findWith(j, "deliveryInfo", "sellerDispatchNumber");
    return {
      items: main.items.map((i) => ({ itemId: String(i.itemId), title: i.title, price: i.price, quantity: i.quantity })),
      dispatchNumber: delivery?.sellerDispatchNumber?.original || undefined,
      shipBy: delivery?.sellerSendTill || undefined,
    };
  }

  /**
   * Собирает пачку: все незакрытые заказы продавца + закрытые за 14 дней, по каждому — карточка (товар,
   * номер отправления). Карточки кэшируются в chrome.storage, повторно читаются только новые заказы и те,
   * у кого ещё нет номера отправления.
   */
  globalThis.__hubbroCollect = async function collect(onProgress = () => {}) {
    try {
      const acc = await account();
      const cutoff = new Date(Date.now() - CLOSED_DAYS * 24 * 3600 * 1000);

      const byId = new Map();
      for (const status of [...ACTIVE, ...CLOSED]) {
        for (const o of await listByStatus(status, CLOSED.includes(status), cutoff, onProgress)) {
          if (o.userKind === "seller") byId.set(o.orderId, o);
        }
        await sleep(PAUSE_MS);
      }

      const key = `details.${acc.id}`;
      const cache = (await chrome.storage.local.get(key))[key] ?? {};
      const list = [...byId.values()];
      const toFetch = list.filter((o) => {
        const c = cache[o.orderId];
        return !c || (!c.dispatchNumber && NEED_DISPATCH.includes(o.status.value));
      });
      for (let i = 0; i < toFetch.length; i++) {
        onProgress(`Карточки заказов: ${i + 1} из ${toFetch.length}`);
        cache[toFetch[i].orderId] = await details(toFetch[i].orderId);
        await sleep(PAUSE_MS);
      }
      await chrome.storage.local.set({ [key]: cache });

      const orders = list.map((o) => ({
        orderId: o.orderId,
        createdAt: o.createdAt,
        updatedAt: o.updatedAt,
        status: o.status.value,
        statusLabel: o.status.label,
        provider: o.provider?.value,
        providerLabel: o.provider?.label,
        trackingNumber: o.provider?.copiedTrackingNumber,
        info: o.info,
        payout: o.cost?.total,
        chatId: o.channelId,
        itemsCount: o.totalItemsCount,
        ...cache[o.orderId],
      }));

      return {
        ok: true,
        batch: { kind: "hubbro.avito-orders", version: 1, collectedAt: new Date().toISOString(), account: acc, orders },
      };
    } catch (e) {
      return { ok: false, error: e instanceof CollectError ? e.message : `Ошибка: ${e?.message ?? e}` };
    }
  };
}
