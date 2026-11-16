// Сбор заказов из кабинета Авито. Работает на странице avito.ru под входом продавца: ходит во внутренний
// JSON сайта (тот же, что грузит страница заказов) и собирает пачку для кабинета HUB BRO.
// Описание — docs/EXTENSION.md.

if (!globalThis.__hubbroCollect) {
  const ACTIVE = ["waiting_confirmation", "waiting_shipment", "in_transit", "delivered_in_pvz", "payout_wait", "on_return", "disputed"];
  const CLOSED = ["finished", "canceled"];
  /** Закрытые заказы берём за последние 14 дней. */
  const CLOSED_DAYS = 14;
  const MAX_PAGES = 25;
  const LIST_PAUSE_MS = 600;
  const DETAIL_PAUSE_MS = 1000;
  /** Карточек за один сбор: остальные дочитаются в следующие разы. Авито режет частые запросы (429). */
  const MAX_DETAILS = 30;
  /** Паузы перед повтором, если Авито ответил 429. */
  const RETRY_MS = [10000, 30000, 60000];
  /** Карточку перечитываем, пока у заказа нет номера отправления и его ещё можно отправить. */
  const NEED_DISPATCH = ["confirmed", "waiting_confirmation"];

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  class CollectError extends Error {}
  class RateLimited extends CollectError {}

  let progress = () => {};

  async function getJson(url) {
    for (let attempt = 0; ; attempt++) {
      let res;
      try {
        res = await fetch(url, { credentials: "include", headers: { accept: "application/json" } });
      } catch {
        throw new CollectError("Нет связи с Авито");
      }
      if (res.status === 429) {
        if (attempt >= RETRY_MS.length) throw new RateLimited("Авито просит паузу (429) — попробуйте через несколько минут");
        const header = Number(res.headers.get("retry-after"));
        const wait = header > 0 ? Math.min(header * 1000, 120000) : RETRY_MS[attempt];
        progress(`Авито просит подождать — жду ${Math.round(wait / 1000)} с…`);
        await sleep(wait);
        continue;
      }
      if (res.status === 401 || res.status === 403) throw new CollectError("Войдите в Авито");
      if (!res.ok) throw new CollectError(`Авито ответил ${res.status}`);
      try {
        return await res.json();
      } catch {
        throw new CollectError("Войдите в Авито");
      }
    }
  }

  async function account() {
    const j = await getJson("/web/1/profiles/list?limit=3&withEntities=true");
    const p = j?.result?.profiles?.find((x) => x.isCurrent);
    if (!p) throw new CollectError("Не понял, какой аккаунт Авито открыт");
    return { id: String(p.profileId), name: p.name };
  }

  /** Все страницы одного фильтра. У закрытых останавливаемся, когда вся страница старше 14 дней. */
  async function listByStatus(status, closed, cutoff) {
    const out = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      progress(`Список: ${status}, страница ${page}`);
      const j = await getJson(`/web/1/orders?page=${page}&limit=20&action=sell&status=${status}`);
      if (!Array.isArray(j.orders)) throw new CollectError("Авито поменял страницу заказов — обновите расширение");
      const fresh = closed ? j.orders.filter((o) => new Date(o.updatedAt) >= cutoff) : j.orders;
      out.push(...fresh);
      if (!j.hasMore || (closed && fresh.length === 0)) break;
      await sleep(LIST_PAUSE_MS);
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
   * номер отправления). Карточки кэшируются в chrome.storage и сохраняются по ходу; за раз читаем не больше
   * MAX_DETAILS — сначала те, что ждут отправки, потом новые. Не успели или Авито попросил паузу — пачка уходит
   * частичной (`partial`), остальное дочитается в следующий раз.
   */
  globalThis.__hubbroCollect = async function collect(onProgress = () => {}) {
    progress = onProgress;
    try {
      const acc = await account();
      const cutoff = new Date(Date.now() - CLOSED_DAYS * 24 * 3600 * 1000);

      const byId = new Map();
      for (const status of [...ACTIVE, ...CLOSED]) {
        for (const o of await listByStatus(status, CLOSED.includes(status), cutoff)) {
          if (o.userKind === "seller") byId.set(o.orderId, o);
        }
        await sleep(LIST_PAUSE_MS);
      }

      const key = `details.${acc.id}`;
      const cache = (await chrome.storage.local.get(key))[key] ?? {};
      const list = [...byId.values()];
      const urgent = (o) => NEED_DISPATCH.includes(o.status.value);
      const need = list
        .filter((o) => !cache[o.orderId] || (!cache[o.orderId].dispatchNumber && urgent(o)))
        .sort((a, b) => Number(urgent(b)) - Number(urgent(a)) || b.createdAt.localeCompare(a.createdAt));
      const batchOf = need.slice(0, MAX_DETAILS);

      let stopped = "";
      for (let i = 0; i < batchOf.length; i++) {
        progress(`Карточки заказов: ${i + 1} из ${batchOf.length}${need.length > batchOf.length ? ` (всего ждут ${need.length})` : ""}`);
        try {
          cache[batchOf[i].orderId] = await details(batchOf[i].orderId);
        } catch (e) {
          if (!(e instanceof RateLimited)) throw e;
          stopped = e.message;
          break;
        }
        if (i % 5 === 4) await chrome.storage.local.set({ [key]: cache });
        await sleep(DETAIL_PAUSE_MS);
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
        title: o.imgSet?.[0]?.alt || undefined,
        ...cache[o.orderId],
      }));
      const missing = list.filter((o) => !cache[o.orderId]).length;

      return {
        ok: true,
        batch: {
          kind: "hubbro.avito-orders",
          version: 1,
          collectedAt: new Date().toISOString(),
          account: acc,
          orders,
          ...(missing ? { missingDetails: missing } : {}),
          ...(stopped ? { stopped } : {}),
        },
      };
    } catch (e) {
      return { ok: false, error: e instanceof CollectError ? e.message : `Ошибка: ${e?.message ?? e}` };
    }
  };
}
