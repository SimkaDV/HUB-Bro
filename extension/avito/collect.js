// Сбор заказов из кабинета Авито. Работает на странице avito.ru под входом продавца: ходит во внутренний
// JSON сайта (тот же, что грузит страница заказов). Два шага: «Посчитать» — только списки, по группам;
// «Собрать» — пачка из отмеченных групп, карточки открываем только там, где без них никак.
// Описание — docs/EXTENSION.md.

if (!globalThis.__hubbro) {
  /** Группы на плашке → фильтры списка Авито. `closed` — берём за последние 14 дней. */
  const GROUPS = [
    { id: "ship", label: "Ждут отправки", filters: ["waiting_confirmation", "waiting_shipment"] },
    { id: "transit", label: "Едут к покупателю", filters: ["in_transit"] },
    { id: "pvz", label: "Ждут в ПВЗ", filters: ["delivered_in_pvz"] },
    { id: "returns", label: "Возвраты и спорные", filters: ["on_return", "disputed"] },
    { id: "finished", label: "Завершены (14 дней)", filters: ["payout_wait", "finished"], closed: true },
    { id: "canceled", label: "Отменены (14 дней)", filters: ["canceled"], closed: true },
  ];
  const DEFAULT_SETTINGS = { groups: ["ship", "transit", "pvz"], autoCount: false, readItems: false };

  const CLOSED_DAYS = 14;
  const MAX_PAGES = 25;
  /** Темп: пауза перед каждым запросом. После 429 до конца сбора идём вдвое медленнее (до ×4). */
  const PAUSE_MS = { list: 700, card: 1200, account: 0 };
  const RETRY_MS = [10000, 30000, 60000];
  /** Карточек за один сбор: остальные дочитаются в следующие разы. */
  const MAX_CARDS = 30;
  /** Карточка нужна, пока у заказа нет номера отправления и его можно отправить. */
  const NEED_DISPATCH = ["confirmed", "waiting_confirmation"];
  /** Номер отправления Авито выдаёт не сразу — без него перечитываем карточку не чаще раза в 30 минут. */
  const RECHECK_MS = 30 * 60 * 1000;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  class CollectError extends Error {}
  class RateLimited extends CollectError {}

  /** Журнал запросов одного прогона: чтобы понять, где Авито начинает резать. */
  function newRun(onProgress) {
    return { started: Date.now(), slow: 1, log: [], waited: 0, progress: onProgress };
  }

  async function getJson(run, kind, url) {
    for (let attempt = 0; ; attempt++) {
      await sleep(PAUSE_MS[kind] * run.slow);
      let res;
      try {
        res = await fetch(url, { credentials: "include", headers: { accept: "application/json" } });
      } catch {
        throw new CollectError("Нет связи с Авито");
      }
      const retryAfter = res.headers.get("retry-after");
      run.log.push({ t: Date.now() - run.started, kind, status: res.status, ...(retryAfter ? { retryAfter } : {}) });
      if (res.status === 429) {
        run.slow = Math.min(run.slow * 2, 4);
        if (attempt >= RETRY_MS.length) throw new RateLimited("Авито просит паузу (429) — попробуйте через несколько минут");
        const wait = Number(retryAfter) > 0 ? Math.min(Number(retryAfter) * 1000, 120000) : RETRY_MS[attempt];
        run.progress(`Авито просит подождать — жду ${Math.round(wait / 1000)} с…`);
        run.waited += wait;
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

  async function account(run) {
    const j = await getJson(run, "account", "/web/1/profiles/list?limit=3&withEntities=true");
    const p = j?.result?.profiles?.find((x) => x.isCurrent);
    if (!p) throw new CollectError("Не понял, какой аккаунт Авито открыт");
    return { id: String(p.profileId), name: p.name };
  }

  /** Все страницы одного фильтра. У закрытых останавливаемся, когда вся страница старше 14 дней. */
  async function listFilter(run, filter, closed) {
    const cutoff = new Date(Date.now() - CLOSED_DAYS * 24 * 3600 * 1000);
    const out = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      run.progress(`Считаю: ${filter}, страница ${page}`);
      const j = await getJson(run, "list", `/web/1/orders?page=${page}&limit=20&action=sell&status=${filter}`);
      if (!Array.isArray(j.orders)) throw new CollectError("Авито поменял страницу заказов — обновите расширение");
      const fresh = (closed ? j.orders.filter((o) => new Date(o.updatedAt) >= cutoff) : j.orders).filter(
        (o) => o.userKind === "seller",
      );
      out.push(...fresh);
      if (!j.hasMore || (closed && fresh.length === 0)) break;
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

  /** Сумма из ответа Авито: число, «1 890 ₽» или объект вида { value: 1890 }. Не нашли — undefined. */
  function amount(v) {
    if (typeof v === "number") return v > 0 ? v : undefined;
    if (typeof v === "string") {
      const n = Number(v.replace(/[^\d.,]/g, "").replace(",", "."));
      return n > 0 ? n : undefined;
    }
    if (v && typeof v === "object") {
      for (const k of ["value", "price", "amount", "raw", "formatted", "text"]) {
        const n = amount(v[k]);
        if (n) return n;
      }
    }
    return undefined;
  }

  async function card(run, orderId) {
    const j = await getJson(
      run,
      "card",
      `/web/2/profile/order?referenceID=${orderId}&templateVersion=0&srcp=orders_list&location=Europe%2FMoscow`,
    );
    const main = j?.result?.content?.main?.params;
    if (!main || !Array.isArray(main.items)) throw new CollectError("Авито поменял карточку заказа — обновите расширение");
    const delivery = findWith(j, "deliveryInfo", "sellerDispatchNumber");
    return {
      items: main.items.map((i) => ({
        itemId: String(i.itemId),
        title: i.title,
        price: i.price,
        oldPrice: amount(i.oldPrice),
        quantity: i.quantity,
      })),
      dispatchNumber: delivery?.sellerDispatchNumber?.original || undefined,
      shipBy: delivery?.sellerSendTill || undefined,
    };
  }

  function summary(run) {
    const n = run.log.length;
    const limited = run.log.filter((r) => r.status === 429).length;
    const secs = Math.round((Date.now() - run.started) / 1000);
    return { requests: n, limited, waitedSec: Math.round(run.waited / 1000), secs };
  }

  async function saveJournal(run, what) {
    await chrome.storage.local.set({ journal: { what, at: new Date().toISOString(), ...summary(run), log: run.log } });
  }

  const fail = (e) => ({ ok: false, error: e instanceof CollectError ? e.message : `Ошибка: ${e?.message ?? e}` });

  /** Последний подсчёт: группы → заказы из списка. Сбор берёт его, если он свежий (5 минут). */
  let counted = null;

  /** Шаг 1: только списки — сколько заказов в каждой группе. */
  async function count(onProgress = () => {}) {
    const run = newRun(onProgress);
    try {
      const acc = await account(run);
      const groups = {};
      for (const g of GROUPS) {
        groups[g.id] = [];
        for (const f of g.filters) groups[g.id].push(...(await listFilter(run, f, g.closed)));
      }
      counted = { at: Date.now(), account: acc, groups };
      await saveJournal(run, "Подсчёт");
      return {
        ok: true,
        account: acc,
        counts: Object.fromEntries(GROUPS.map((g) => [g.id, groups[g.id].length])),
        stats: summary(run),
      };
    } catch (e) {
      await saveJournal(run, "Подсчёт (ошибка)");
      return fail(e);
    }
  }

  /**
   * Шаг 2: пачка из отмеченных групп. Карточки — только «Ждут отправки» без номера отправления и не читанные
   * раньше (и остальные группы, если включено «дочитать товары»), не больше MAX_CARDS, кэш по ходу.
   */
  async function collect({ groups: chosen, readItems }, onProgress = () => {}) {
    if (!counted || Date.now() - counted.at > 5 * 60 * 1000) {
      const c = await count(onProgress);
      if (!c.ok) return c;
    }
    const run = newRun(onProgress);
    try {
      const acc = counted.account;
      const list = chosen.flatMap((id) => counted.groups[id] ?? []);
      const key = `details.${acc.id}`;
      const cache = (await chrome.storage.local.get(key))[key] ?? {};

      const urgent = (o) => NEED_DISPATCH.includes(o.status.value);
      const stale = (c) => !c || (!c.dispatchNumber && !(Date.now() - (c.checkedAt ?? 0) < RECHECK_MS));
      const need = list
        .filter((o) => (urgent(o) ? stale(cache[o.orderId]) : readItems && !cache[o.orderId]))
        .sort((a, b) => Number(urgent(b)) - Number(urgent(a)) || b.createdAt.localeCompare(a.createdAt));
      const now = need.slice(0, MAX_CARDS);

      let stopped = "";
      let read = 0;
      for (let i = 0; i < now.length; i++) {
        run.progress(`Карточки заказов: ${i + 1} из ${now.length}${need.length > now.length ? ` (ждут ${need.length})` : ""}`);
        try {
          cache[now[i].orderId] = { ...(await card(run, now[i].orderId)), checkedAt: Date.now() };
          read += 1;
        } catch (e) {
          if (!(e instanceof RateLimited)) throw e;
          stopped = e.message;
          break;
        }
        if (i % 5 === 4) await chrome.storage.local.set({ [key]: cache });
      }
      await chrome.storage.local.set({ [key]: cache });
      await saveJournal(run, "Сбор");

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
      const missing = need.length - read;

      return {
        ok: true,
        stats: summary(run),
        batch: {
          kind: "hubbro.avito-orders",
          version: 1,
          collectedAt: new Date().toISOString(),
          account: acc,
          groups: chosen,
          orders,
          ...(missing > 0 ? { missingDetails: missing } : {}),
          ...(stopped ? { stopped } : {}),
        },
      };
    } catch (e) {
      await saveJournal(run, "Сбор (ошибка)");
      return fail(e);
    }
  }

  async function settings() {
    return { ...DEFAULT_SETTINGS, ...(await chrome.storage.local.get("settings")).settings };
  }

  async function saveSettings(patch) {
    await chrome.storage.local.set({ settings: { ...(await settings()), ...patch } });
  }

  globalThis.__hubbro = { GROUPS, count, collect, settings, saveSettings };
}
