import { useMemo, useState } from "react";
import { api, ApiError } from "../api";
import { BatchModal } from "../components/BatchModal";
import { OrderDrawer } from "../components/OrderDrawer";
import { Empty, ErrorLine, StatusBadge } from "../components/ui";
import { deadlineTone, dt } from "../format";
import { useApi } from "../hooks";
import type { Order, QueueCounts, Shop } from "../types";

type Key = "shop" | "model" | "size" | "location" | "pvz" | "deadline" | "none";

const KEYS: Record<Exclude<Key, "none">, { label: string; get: (o: Order) => string }> = {
  shop: { label: "Магазин", get: (o) => o.shop.name },
  model: { label: "Модель", get: (o) => o.items[0]?.product?.model ?? "Без SKU" },
  size: { label: "Размер", get: (o) => o.items[0]?.product?.size ?? "—" },
  location: { label: "Ячейка", get: (o) => o.items[0]?.product?.location_code?.split("-").slice(0, 2).join("-") ?? "—" },
  pvz: { label: "ПВЗ", get: (o) => o.pvz_name ?? "—" },
  deadline: { label: "Срок отправки", get: (o) => o.deadline_at ? new Date(o.deadline_at).toLocaleDateString("ru-RU", { day: "2-digit", month: "long" }) : "Без срока" },
};

const VIEW_KEY = "hubbro.fulfillmentView";
type View = { levels: Key[]; onlyReady: boolean; shopId: number | null };

function loadView(): View {
  try { return { levels: ["shop", "model", "none"], onlyReady: true, shopId: null, ...JSON.parse(localStorage.getItem(VIEW_KEY) ?? "{}") }; }
  catch { return { levels: ["shop", "model", "none"], onlyReady: true, shopId: null }; }
}

type Group = { key: string; path: string; orders: Order[]; children: Group[] };

function groupBy(orders: Order[], levels: Key[], path = ""): Group[] {
  const [lvl, ...rest] = levels.filter((l) => l !== "none");
  if (!lvl) return [];
  const map = new Map<string, Order[]>();
  for (const o of orders) {
    const k = KEYS[lvl as Exclude<Key, "none">].get(o);
    map.set(k, [...(map.get(k) ?? []), o]);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "ru", { numeric: true }))
    .map(([key, os]) => ({ key, path: `${path}/${key}`, orders: os, children: groupBy(os, rest, `${path}/${key}`) }));
}

const printable = (o: Order) => o.internal_status === "LABEL_READY" && !o.batch;

export function Fulfillment() {
  const [view, setView] = useState<View>(loadView);
  const q = useApi<{ counts: QueueCounts; orders: Order[] }>(`/api/fulfillment/queue${view.shopId ? `?shop_id=${view.shopId}` : ""}`, 10_000);
  const { data: shops } = useApi<Shop[]>("/api/shops");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [batchId, setBatchId] = useState<number | null>(null);
  const [openOrder, setOpenOrder] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const update = (v: Partial<View>) => {
    const next = { ...view, ...v };
    setView(next);
    try { localStorage.setItem(VIEW_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  };

  const orders = useMemo(() => (q.data?.orders ?? []).filter((o) => !view.onlyReady || printable(o)), [q.data, view.onlyReady]);
  const groups = useMemo(() => groupBy(orders, view.levels), [orders, view.levels]);
  const counts = q.data?.counts;

  const toggle = (ids: number[], on: boolean) => {
    const s = new Set(selected);
    ids.forEach((id) => (on ? s.add(id) : s.delete(id)));
    setSelected(s);
  };

  const createBatch = async (ids: number[]) => {
    setError(null);
    try {
      const b = await api<{ id: number }>("/api/print-batches", { body: { order_ids: ids, filters: view } });
      setSelected(new Set());
      setBatchId(b.id);
    } catch (e) {
      const d = (e as ApiError).detail as { problems?: Record<string, string> } | undefined;
      setError((e as Error).message + (d?.problems ? ": " + Object.entries(d.problems).map(([id, p]) => `#${id} ${p}`).join("; ") : ""));
      q.reload();
    }
  };

  const selectable = orders.filter(printable).map((o) => o.id);
  const selCount = [...selected].filter((id) => selectable.includes(id)).length;

  const renderGroup = (g: Group, depth: number) => {
    const ids = g.orders.filter(printable).map((o) => o.id);
    const allOn = ids.length > 0 && ids.every((id) => selected.has(id));
    const isCollapsed = collapsed.has(g.path);
    return (
      <div key={g.path} className={`group depth${depth}`}>
        <div className="group-head">
          <input type="checkbox" checked={allOn} disabled={!ids.length} onChange={(e) => toggle(ids, e.target.checked)} aria-label={`Выбрать группу ${g.key}`} />
          <button className="ghost group-title" onClick={() => {
            const s = new Set(collapsed); isCollapsed ? s.delete(g.path) : s.add(g.path); setCollapsed(s);
          }}>
            {isCollapsed ? "▸" : "▾"} {g.key}
          </button>
          <span className="muted">{g.orders.length} заказ(ов), к печати {ids.length}</span>
          {ids.length > 0 && <button className="small" onClick={() => createBatch(ids)}>Партия из группы ({ids.length})</button>}
        </div>
        {!isCollapsed && (g.children.length ? g.children.map((c) => renderGroup(c, depth + 1)) : <OrderTable orders={g.orders} />)}
      </div>
    );
  };

  const OrderTable = ({ orders }: { orders: Order[] }) => (
    <table className="orders">
      <thead><tr><th></th><th>Заказ</th><th>Товар</th><th>SKU / ячейка</th><th>ПВЗ</th><th>Срок</th><th>Статус</th></tr></thead>
      <tbody>
        {orders.map((o) => {
          const p = o.items[0]?.product;
          return (
            <tr key={o.id} className={selected.has(o.id) ? "sel" : ""} onClick={() => setOpenOrder(o.id)}>
              <td onClick={(e) => e.stopPropagation()}>
                <input type="checkbox" checked={selected.has(o.id)} disabled={!printable(o)} onChange={(e) => toggle([o.id], e.target.checked)} aria-label={`Выбрать заказ ${o.id}`} />
              </td>
              <td><b>#{o.id}</b><div className="muted mono">{o.marketplace_id}</div></td>
              <td>
                {p ? <><b>{p.model}</b> · <b className="size">{p.size}</b> · {p.color}</> : o.items[0]?.title}
                {o.items.length > 1 && <span className="badge info">+{o.items.length - 1}</span>}
              </td>
              <td className="mono">{o.items[0]?.sku ?? "—"}<div className="muted">{p?.location_code}</div></td>
              <td>{o.pvz_name}</td>
              <td className={deadlineTone(o.deadline_at)}>{dt(o.deadline_at)}</td>
              <td><StatusBadge status={o.internal_status} />{o.batch && <div className="muted">в {o.batch.code}</div>}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  return (
    <div>
      <div className="page-head">
        <h1>Комплектация и печать</h1>
        <button className="ghost" onClick={async () => { await api("/api/integrations/sync", { method: "POST" }).catch((e) => setError(e.message)); q.reload(); }}>↻ Обновить из Авито</button>
      </div>

      {counts && (
        <div className="counters">
          <div className="counter"><span>Всего в работе</span><b>{counts.total}</b></div>
          <div className="counter ok"><span>Готовы к печати</span><b>{counts.ready}</b></div>
          <div className="counter info"><span>В партиях</span><b>{counts.in_batch}</b></div>
          <div className="counter info"><span>Напечатаны</span><b>{counts.printed}</b></div>
          <div className="counter warn"><span>Ждут</span><b>{counts.blocked}</b></div>
          <a className="counter bad" href="#/problems"><span>Проблемы</span><b>{counts.problem}</b></a>
        </div>
      )}

      <div className="toolbar">
        <label className="field"><span>Магазин</span>
          <select value={view.shopId ?? ""} onChange={(e) => update({ shopId: e.target.value ? Number(e.target.value) : null })}>
            <option value="">Все магазины</option>
            {shops?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        {view.levels.map((lvl, i) => (
          <label key={i} className="field"><span>{i === 0 ? "Группировать по" : "затем"}</span>
            <select value={lvl} onChange={(e) => { const l = [...view.levels]; l[i] = e.target.value as Key; update({ levels: l }); }}>
              {i > 0 && <option value="none">—</option>}
              {Object.entries(KEYS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </label>
        ))}
        <label className="check"><input type="checkbox" checked={view.onlyReady} onChange={(e) => update({ onlyReady: e.target.checked })} /> только готовые к печати</label>
      </div>

      <div className="sticky-actions">
        <span>Выбрано: <b>{selCount}</b></span>
        <button className="ghost" onClick={() => toggle(selectable, true)} disabled={!selectable.length}>Выбрать все на экране ({selectable.length})</button>
        <button className="ghost" onClick={() => setSelected(new Set())} disabled={!selected.size}>Снять выбор</button>
        <button className="primary" disabled={!selCount} onClick={() => createBatch([...selected].filter((id) => selectable.includes(id)))}>Создать партию ({selCount})</button>
      </div>

      <ErrorLine error={error ?? q.error} />
      {q.data && !orders.length && <Empty>{view.onlyReady ? "Нет заказов, готовых к печати." : "Очередь пуста."}</Empty>}
      {groups.length ? groups.map((g) => renderGroup(g, 0)) : orders.length > 0 && <OrderTable orders={orders} />}

      {batchId && <BatchModal batchId={batchId} onClose={() => { setBatchId(null); q.reload(); }} />}
      {openOrder && <OrderDrawer orderId={openOrder} onClose={() => setOpenOrder(null)} onChanged={q.reload} />}
    </div>
  );
}
