import { useCallback, useState } from "react";
import { api, openLabelPdf } from "../api";
import { dt, STATUS } from "../format";
import { useApi } from "../hooks";
import type { OrderDetail } from "../types";
import { loadTarget, PrintTarget, Target } from "./PrintTarget";
import { ErrorLine, Modal, StatusBadge } from "./ui";

const ACTIONS: Record<string, string> = {
  status: "Статус", imported: "Импортирован", invalidated: "Этикетка недействительна", reprint: "Повторная печать",
  dispatched: "Сдан",
};

export function OrderDrawer({ orderId, onClose, onChanged }: { orderId: number; onClose: () => void; onChanged?: () => void }) {
  const { data: o, reload } = useApi<OrderDetail>(`/api/orders/${orderId}`);
  const [target, setTarget] = useState<Target>(loadTarget);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const onTarget = useCallback((t: Target) => setTarget(t), []);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setError(null); setMsg(null);
    try { await fn(); setMsg(ok); await reload(); onChanged?.(); } catch (e) { setError((e as Error).message); }
  };

  if (!o) return <Modal title="Заказ" onClose={onClose}><p>Загрузка…</p></Modal>;

  return (
    <Modal wide onClose={onClose} title={<>Заказ #{o.id} <StatusBadge status={o.internal_status} /></>}>
      <div className="grid2">
        <div>
          <dl className="kv">
            <dt>Магазин</dt><dd>{o.shop.name}</dd>
            <dt>Заказ Авито</dt><dd className="mono">{o.external_order_id}</dd>
            <dt>№ в кабинете</dt><dd className="mono">{o.marketplace_id ?? "—"}</dd>
            <dt>Статус Авито</dt><dd>{o.external_status ?? "—"}</dd>
            <dt>ПВЗ</dt><dd>{o.pvz_name}<br /><span className="muted">{o.pvz_address}</span></dd>
            <dt>Отправить до</dt><dd>{dt(o.deadline_at)}</dd>
            <dt>Партия</dt><dd>{o.batch ? o.batch.code : "—"}</dd>
          </dl>
          <h4>Товары</h4>
          {o.items.map((i) => (
            <div key={i.id} className="item-line">
              <b>{i.product ? `${i.product.model} · ${i.product.size} · ${i.product.color}` : i.title}</b>
              <div className="muted">
                {i.sku ?? <span className="badge bad">⚠ не сопоставлен: {i.external_item_id}</span>} · ячейка {i.product?.location_code ?? "—"} · {i.qty} шт. · {i.reserved ? "в резерве" : "без резерва"}
              </div>
            </div>
          ))}
        </div>
        <div>
          <h4>Этикетки</h4>
          {o.labels.length === 0 && <p className="muted">Транспортный документ ещё не получен.</p>}
          {o.labels.map((lb) => (
            <div key={lb.id} className={`label-line ${lb.valid ? "" : "invalid"}`}>
              <span className="mono">{lb.code}</span> · печатей: {lb.print_count}
              {lb.is_mock && <span className="badge warn">тест</span>}
              {!lb.valid && <span className="badge muted">недействительна: {lb.invalid_reason}</span>}
              <button className="link" onClick={() => openLabelPdf(lb.id).catch((e) => setError(e.message))}>PDF</button>
            </div>
          ))}
          {o.label && (
            <div className="panel mt">
              <h4>Повторная печать {o.label.code}</h4>
              <PrintTarget value={target} onChange={onTarget} />
              <label className="field mt"><span>Причина</span>
                <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="например, смазалась при печати" />
              </label>
              <button className="mt" disabled={!reason.trim() || !target.station_id}
                      onClick={() => run(() => api(`/api/labels/${o.label!.id}/reprint`, { body: { ...target, reason } }), "Задание отправлено на принтер")}>
                ⎙ Напечатать ещё раз
              </button>
            </div>
          )}
          <div className="row gap mt">
            {o.internal_status === "LABEL_PRINTED" &&
              <button className="primary" onClick={() => run(() => api(`/api/orders/${o.id}/pick`, { method: "POST" }), "Отмечен как собранный")}>✓ Собран</button>}
            {(o.internal_status === "PICKED" || o.internal_status === "READY_FOR_DISPATCH") &&
              <button className="primary" onClick={() => run(() => api(`/api/orders/${o.id}/dispatch`, { method: "POST" }), "Отмечен как сданный")}>→ Сдан в ПВЗ</button>}
          </div>
          {msg && <div className="ok-line">{msg}</div>}
          <ErrorLine error={error} />
        </div>
      </div>
      <h4>История</h4>
      <table>
        <tbody>
          {o.history.map((h, n) => (
            <tr key={n}>
              <td className="nowrap muted">{dt(h.at)}</td>
              <td>{ACTIONS[h.action] ?? h.action}</td>
              <td>
                {h.action === "status"
                  ? <>{STATUS[String(h.data.frm)]?.text ?? String(h.data.frm)} → <b>{STATUS[String(h.data.to)]?.text ?? String(h.data.to)}</b> <span className="muted">{String(h.data.reason ?? "")}</span></>
                  : <span className="muted">{Object.entries(h.data).map(([k, v]) => `${k}: ${v}`).join(", ")}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}
