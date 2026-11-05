import { useEffect, useRef, useState } from "react";
import { OrderDrawer } from "../components/OrderDrawer";
import { Empty, ErrorLine, StatusBadge } from "../components/ui";
import { deadlineTone, dt, STATUS } from "../format";
import { useApi } from "../hooks";
import type { Order, Shop } from "../types";

export function Orders() {
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [shopId, setShopId] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const params = new URLSearchParams({ ...(query && { q: query }), ...(status && { status }), ...(shopId && { shop_id: shopId }) });
  const { data, error, reload } = useApi<Order[]>(`/api/orders?${params}`);
  const { data: shops } = useApi<Shop[]>("/api/shops");

  useEffect(() => { const t = setTimeout(() => setQuery(q), 300); return () => clearTimeout(t); }, [q]);
  useEffect(() => {
    // «/» — к поиску; сканер вводит код как клавиатура и жмёт Enter
    const on = (e: KeyboardEvent) => { if (e.key === "/" && document.activeElement?.tagName !== "INPUT") { e.preventDefault(); input.current?.focus(); } };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);

  return (
    <div>
      <div className="page-head"><h1>Заказы</h1></div>
      <div className="toolbar">
        <label className="field grow"><span>Поиск (нажмите «/» или отсканируйте код)</span>
          <input ref={input} autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="№ заказа, № Авито, L-000123, SKU, ПВЗ"
                 onKeyDown={(e) => { if (e.key === "Enter") { setQuery(q); if (data?.length === 1) setOpen(data[0].id); } }} />
        </label>
        <label className="field"><span>Статус</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Все</option>
            {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.text}</option>)}
          </select>
        </label>
        <label className="field"><span>Магазин</span>
          <select value={shopId} onChange={(e) => setShopId(e.target.value)}>
            <option value="">Все</option>
            {shops?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
      </div>
      <ErrorLine error={error} />
      {data && !data.length && <Empty>Ничего не найдено.</Empty>}
      {data && data.length > 0 && (
        <table className="orders">
          <thead><tr><th>Заказ</th><th>Магазин</th><th>Товар</th><th>ПВЗ</th><th>Срок</th><th>Статус</th><th>Этикетка</th></tr></thead>
          <tbody>
            {data.map((o) => (
              <tr key={o.id} onClick={() => setOpen(o.id)}>
                <td><b>#{o.id}</b><div className="muted mono">{o.marketplace_id}</div></td>
                <td>{o.shop.name}</td>
                <td>{o.items.map((i) => i.product ? `${i.product.model} ${i.product.size} ${i.product.color}` : i.title).join(", ")}</td>
                <td>{o.pvz_name}</td>
                <td className={deadlineTone(o.deadline_at)}>{dt(o.deadline_at)}</td>
                <td><StatusBadge status={o.internal_status} /></td>
                <td className="mono">{o.label?.code ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {open && <OrderDrawer orderId={open} onClose={() => setOpen(null)} onChanged={reload} />}
    </div>
  );
}
