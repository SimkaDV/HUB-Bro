import { useCallback, useState } from "react";
import { api } from "../api";
import { BATCH_STATUS, JOB_STATUS } from "../format";
import { useApi } from "../hooks";
import type { Preview } from "../types";
import { loadTarget, PrintTarget, Target } from "./PrintTarget";
import { ErrorLine, Modal } from "./ui";

function Summary({ title, data }: { title: string; data: Record<string, number> }) {
  return (
    <div className="summary">
      <h4>{title}</h4>
      {Object.entries(data).sort().map(([k, v]) => <div key={k} className="row between"><span>{k}</span><b>{v}</b></div>)}
    </div>
  );
}

/** Партия: preview → печать → статус заданий → повтор/закрытие. */
export function BatchModal({ batchId, onClose }: { batchId: number; onClose: () => void }) {
  const { data: b, reload } = useApi<Preview>(`/api/print-batches/${batchId}/preview`, 2000);
  const [target, setTarget] = useState<Target>(loadTarget);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const onTarget = useCallback((t: Target) => setTarget(t), []);

  const act = async (path: string, body?: unknown) => {
    setBusy(true); setError(null);
    try { await api(`/api/print-batches/${batchId}/${path}`, { method: "POST", body }); await reload(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  if (!b) return <Modal title="Партия" onClose={onClose}><p>Загрузка…</p></Modal>;
  const problems = Object.keys(b.problems).length;

  return (
    <Modal wide onClose={onClose} title={<>Партия {b.code} <span className="badge info">{BATCH_STATUS[b.status]}</span></>}>
      <div className="big-count">Этикеток к печати: <b>{b.labels_count}</b></div>
      <div className="summaries">
        <Summary title="Магазины" data={b.summary.shop} />
        <Summary title="Модели" data={b.summary.model} />
        <Summary title="Размеры" data={b.summary.size} />
        <Summary title="ПВЗ" data={b.summary.pvz} />
      </div>

      {problems > 0 && (
        <div className="error-line">
          {problems} заказ(ов) изменились после создания партии: {Object.entries(b.problems).map(([id, p]) => `#${id} — ${p}`).join("; ")}.
          Отмените партию и соберите новую.
        </div>
      )}

      {b.status === "draft" && (
        <div className="panel">
          <PrintTarget value={target} onChange={onTarget} />
          <div className="row gap mt">
            <button className="primary" disabled={busy || problems > 0 || !target.station_id}
                    onClick={() => act("print", target)}>
              ⎙ Печатать {b.labels_count} шт.
            </button>
            <button className="ghost" disabled={busy} onClick={() => act("cancel").then(onClose)}>Отменить партию</button>
          </div>
        </div>
      )}

      {b.job_list && b.job_list.length > 0 && (
        <>
          <div className="row gap mt">
            {(["queued", "sent", "done", "failed"] as const).map((s) =>
              <span key={s} className={`badge ${s === "failed" ? "bad" : s === "done" ? "ok" : "info"}`}>{JOB_STATUS[s]}: {b.jobs[s]}</span>)}
          </div>
          <p className="hint">«Напечатано» значит, что файл передан в очередь принтера на ПК. Сверьте ленту: если наклейка не вышла — повторите её отдельно в карточке заказа.</p>
          <table className="mt">
            <thead><tr><th>Этикетка</th><th>Заказ</th><th>Попытка</th><th>Статус</th><th>Ошибка</th></tr></thead>
            <tbody>
              {b.job_list.map((j) => (
                <tr key={j.id}>
                  <td className="mono">{j.label_code}</td>
                  <td>#{j.order_id}</td>
                  <td>{j.attempt}</td>
                  <td><span className={`badge ${j.status === "failed" ? "bad" : j.status === "done" ? "ok" : "info"}`}>{JOB_STATUS[j.status]}</span></td>
                  <td className="muted">{j.error}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="row gap mt">
            {b.status === "failed" && <button className="primary" disabled={busy} onClick={() => act("retry")}>Повторить сбойные</button>}
            {(b.status === "printed" || b.status === "failed") &&
              <button disabled={busy} onClick={() => act("close").then(onClose)}>Закрыть партию</button>}
          </div>
        </>
      )}
      <ErrorLine error={error} />
    </Modal>
  );
}
