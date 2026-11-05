import { useState } from "react";
import { api } from "../api";
import { ErrorLine, Modal } from "../components/ui";
import { useApi } from "../hooks";
import type { Product } from "../types";

export function Products() {
  const { data, error, reload } = useApi<Product[]>("/api/products");
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<Product | null>(null);
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const rows = (data ?? []).filter((p) => !q || `${p.sku} ${p.title} ${p.location_code}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div>
      <div className="page-head"><h1>Каталог и остатки</h1></div>
      <div className="toolbar">
        <label className="field grow"><span>Поиск</span><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="SKU, модель, ячейка" /></label>
      </div>
      {msg && <div className="ok-line">{msg}</div>}
      <ErrorLine error={error} />
      <table>
        <thead><tr><th>SKU</th><th>Товар</th><th>Ячейка</th><th className="num">На складе</th><th className="num">Резерв</th><th className="num">Доступно</th><th></th></tr></thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id}>
              <td className="mono">{p.sku}</td>
              <td>{p.title}</td>
              <td className="mono">{p.location_code}</td>
              <td className="num">{p.on_hand}</td>
              <td className="num">{p.reserved}</td>
              <td className={`num ${p.available <= 0 ? "bad" : ""}`}><b>{p.available}</b></td>
              <td><button className="small ghost" onClick={() => { setEdit(p); setDelta(""); setReason(""); setErr(null); }}>Корректировка</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      {edit && (
        <Modal title={`Корректировка ${edit.sku}`} onClose={() => setEdit(null)}>
          <p>Сейчас на складе: <b>{edit.on_hand}</b>, в резерве: <b>{edit.reserved}</b></p>
          <label className="field"><span>Изменение (например, +3 или -1)</span>
            <input value={delta} onChange={(e) => setDelta(e.target.value)} inputMode="numeric" autoFocus />
          </label>
          <label className="field mt"><span>Причина</span>
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="приёмка, пересчёт, брак…" />
          </label>
          <ErrorLine error={err} />
          <button className="primary mt" disabled={!Number(delta) || !reason.trim()} onClick={async () => {
            try {
              const r = await api<{ orders_changed: number }>(`/api/products/${edit.id}/adjust`, { body: { delta: Number(delta), reason } });
              setMsg(`Остаток ${edit.sku} обновлён${r.orders_changed ? `, разблокировано заказов: ${r.orders_changed}` : ""}`);
              setEdit(null); reload();
            } catch (e) { setErr((e as Error).message); }
          }}>Сохранить</button>
        </Modal>
      )}
    </div>
  );
}
