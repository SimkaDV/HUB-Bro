import { useState } from "react";
import { BatchModal } from "../components/BatchModal";
import { Empty, ErrorLine } from "../components/ui";
import { BATCH_STATUS, dt } from "../format";
import { useApi } from "../hooks";
import type { Batch } from "../types";

export function Batches() {
  const { data, error, reload } = useApi<Batch[]>("/api/print-batches", 5000);
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div>
      <div className="page-head"><h1>Печатные партии</h1></div>
      <ErrorLine error={error} />
      {data && !data.length && <Empty>Партий ещё нет. Создайте первую в разделе «Комплектация».</Empty>}
      {data && data.length > 0 && (
        <table>
          <thead><tr><th>Партия</th><th>Создана</th><th>Статус</th><th>Заказов</th><th>Напечатано</th><th>Сбои</th><th>Принтер</th></tr></thead>
          <tbody>
            {data.map((b) => (
              <tr key={b.id} onClick={() => setOpen(b.id)}>
                <td className="mono"><b>{b.code}</b></td>
                <td>{dt(b.created_at)}</td>
                <td><span className={`badge ${b.status === "failed" ? "bad" : b.status === "printed" ? "ok" : "info"}`}>{BATCH_STATUS[b.status]}</span></td>
                <td>{b.orders_count}</td>
                <td>{b.jobs.done}</td>
                <td className={b.jobs.failed ? "bad" : ""}>{b.jobs.failed}</td>
                <td>{b.printer_name ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {open && <BatchModal batchId={open} onClose={() => { setOpen(null); reload(); }} />}
    </div>
  );
}
