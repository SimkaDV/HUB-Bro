import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { batchState, isActive, isToday, useBatches } from "@/shared/fulfillment";
import { useOrders } from "@/shared/orders";
import { PRINTER_STATUS, usePrinterLink } from "@/shared/printer";
import { Collapse, PageHeader, StatTiles, StatusBadge } from "@/shared/ui";
import { BatchCard } from "./BatchCard/BatchCard";
import { QuickPrint } from "./QuickPrint/QuickPrint";
import styles from "./LabelsPage.module.css";

// Пульт: партии из комплектации — печать и «Партия расклеена». Описание — docs/PICKING.md, раздел 8.
export default function LabelsPage() {
  const batches = useBatches();
  const orders = useOrders();
  const printer = usePrinterLink();
  const [historyOpen, setHistoryOpen] = useState(false);
  const byId = useMemo(() => new Map(orders.map((o) => [o.id, o])), [orders]);

  // Сначала то, что ждёт действия: старые партии сверху, чтобы печатать по порядку.
  const active = batches.filter(isActive).sort((a, b) => a.number - b.number);
  const done = batches.filter((b) => !isActive(b));
  const queued = active.filter((b) => batchState(b) === "queued");
  const printed = active.filter((b) => batchState(b) === "printed");
  const stuckToday = done.filter((b) => b.stuckAt && isToday(b.stuckAt));
  const units = (list: typeof batches) => list.reduce((n, b) => n + b.orderIds.length, 0);
  const issuesToday = stuckToday.reduce((n, b) => n + b.issues.length, 0);

  return (
    <>
      <PageHeader title="Пульт" subtitle="Печать и расклейка партий из комплектации" />

      <StatTiles
        tiles={[
          { label: "Ждут печати", value: queued.length, detail: `партий · ${units(queued)} шт.` },
          { label: "Ждут расклейки", value: printed.length, detail: `партий · ${units(printed)} шт.` },
          { label: "Расклеено сегодня", value: stuckToday.length, detail: `партий · ${units(stuckToday) - issuesToday} шт. собрано` },
          { label: "Ошибок сегодня", value: issuesToday, detail: "вернулись в очередь", alert: issuesToday > 0 },
        ]}
      />

      <QuickPrint />

      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>На пульте</h2>
        <span className={styles.printer}>
          <StatusBadge tone={PRINTER_STATUS[printer.state].tone}>Принтер: {PRINTER_STATUS[printer.state].label}</StatusBadge>
          {printer.state !== "ready" && printer.state !== "unsupported" && <Link to="/settings#printer">настройки →</Link>}
        </span>
      </div>
      {active.length === 0 ? (
        <p className={styles.empty}>
          Партий нет. Собери партию в <Link to="/picking">комплектации</Link>.
        </p>
      ) : (
        <div className={styles.list}>
          {active.map((b) => (
            <BatchCard key={b.id} batch={b} orders={byId} />
          ))}
        </div>
      )}

      {done.length > 0 && (
        <section className={styles.history}>
          <button type="button" className={styles.historyToggle} aria-expanded={historyOpen} onClick={() => setHistoryOpen(!historyOpen)}>
            {historyOpen ? "Скрыть историю" : "Показать историю"} <span className={styles.count}>{done.length}</span> ▾
          </button>
          <Collapse open={historyOpen} className={styles.list}>
            {done.map((b) => (
              <BatchCard key={b.id} batch={b} orders={byId} />
            ))}
          </Collapse>
        </section>
      )}
    </>
  );
}
