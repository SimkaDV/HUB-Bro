import { useState } from "react";
import { api } from "../api";
import { OrderDrawer } from "../components/OrderDrawer";
import { Empty, ErrorLine, StatusBadge } from "../components/ui";
import { dt } from "../format";
import { useApi } from "../hooks";
import type { Order, Product } from "../types";

type Event = { id: number; kind: string; external_id: string | null; message: string | null; at: string };

function MapItem({ order, itemId, products, onDone }: { order: Order; itemId: string; products: Product[]; onDone: () => void }) {
  const [pid, setPid] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="row gap">
      <select value={pid} onChange={(e) => setPid(e.target.value)}>
        <option value="">Выберите SKU…</option>
        {products.map((p) => <option key={p.id} value={p.id}>{p.sku} — {p.title} (доступно {p.available})</option>)}
      </select>
      <button className="small" disabled={!pid} onClick={async () => {
        try {
          await api("/api/mappings", { body: { shop_id: order.shop.id, external_item_id: itemId, product_id: Number(pid) } });
          onDone();
        } catch (e) { setError((e as Error).message); }
      }}>Сопоставить</button>
      <ErrorLine error={error} />
    </div>
  );
}

export function Problems() {
  const { data, error, reload } = useApi<Order[]>("/api/orders?status=NEEDS_MAPPING,OUT_OF_STOCK", 15_000);
  const { data: products } = useApi<Product[]>("/api/products");
  const { data: events } = useApi<Event[]>("/api/integrations/events?errors_only=true&limit=20");
  const [open, setOpen] = useState<number | null>(null);

  return (
    <div>
      <div className="page-head"><h1>Проблемы</h1></div>
      <ErrorLine error={error} />
      {data && !data.length && <Empty>Проблемных заказов нет.</Empty>}
      {data && data.length > 0 && (
        <table>
          <thead><tr><th>Заказ</th><th>Магазин</th><th>Проблема</th><th>Товар</th><th>Что сделать</th></tr></thead>
          <tbody>
            {data.map((o) => (
              <tr key={o.id}>
                <td><button className="link" onClick={() => setOpen(o.id)}>#{o.id}</button><div className="muted">{dt(o.ordered_at)}</div></td>
                <td>{o.shop.name}</td>
                <td><StatusBadge status={o.internal_status} /></td>
                <td>{o.items.map((i) => <div key={i.id}>{i.title} <span className="muted mono">{i.sku ?? i.external_item_id}</span></div>)}</td>
                <td>
                  {o.internal_status === "NEEDS_MAPPING" && products && o.items.filter((i) => !i.sku).map((i) =>
                    <MapItem key={i.id} order={o} itemId={i.external_item_id} products={products} onDone={reload} />)}
                  {o.internal_status === "OUT_OF_STOCK" &&
                    <span className="muted">Проверьте ячейку {o.items[0]?.product?.location_code}. Если товар есть — поправьте остаток в «Каталоге», заказ разблокируется сам.</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {events && events.length > 0 && (
        <>
          <h3 className="mt">Ошибки интеграции</h3>
          <table><tbody>
            {events.map((e) => <tr key={e.id}><td className="nowrap muted">{dt(e.at)}</td><td>{e.kind}</td><td className="mono">{e.external_id}</td><td>{e.message}</td></tr>)}
          </tbody></table>
        </>
      )}
      {open && <OrderDrawer orderId={open} onClose={() => setOpen(null)} onChanged={reload} />}
    </div>
  );
}
