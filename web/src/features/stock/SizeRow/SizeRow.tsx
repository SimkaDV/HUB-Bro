import { useEffect, useRef, useState } from "react";
import { Collapse, StatusBadge } from "@/shared/ui";
import { SizeChip } from "../SizeChip/SizeChip";
import { UnitRow } from "../UnitRow/UnitRow";
import { useStockSettings } from "../settings";
import { formatRub, HIDDEN_STATUSES, summarize, VISIBLE_STATUSES } from "@/shared/stock";
import type { Model, SizeStock, Unit, UnitStatus } from "@/shared/stock";
import styles from "./SizeRow.module.css";

type Props = {
  model: Model;
  sizeStock: SizeStock;
  /** Меняется — размер раскрывается, прокручивается в видимую область и подсвечивается. */
  focusNonce?: number;
};

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function byStatus(units: Unit[], order: UnitStatus[]) {
  return units
    .filter((u) => order.includes(u.status))
    .sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status));
}

export function SizeRow({ model, sizeStock, focusNonce }: Props) {
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [flash, setFlash] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { thresholdsFor } = useStockSettings();

  useEffect(() => {
    if (focusNonce === undefined) return;
    setOpen(true);
    setFlash(false);
    // Кадр на то, чтобы панель модели успела появиться.
    const scroll = window.setTimeout(() => {
      ref.current?.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "start" });
      setFlash(true);
    }, 50);
    const unflash = window.setTimeout(() => setFlash(false), 1500);
    return () => {
      window.clearTimeout(scroll);
      window.clearTimeout(unflash);
    };
  }, [focusNonce]);

  const batch = (id: string) => model.batches.find((b) => b.id === id)!;
  const visible = byStatus(sizeStock.units, VISIBLE_STATUSES);
  const hidden = byStatus(sizeStock.units, HIDDEN_STATUSES);
  const onShelf = sizeStock.stock.filter((s) => s.qty > 0);

  const count = (status: UnitStatus) => sizeStock.units.filter((u) => u.status === status).length;
  const summary = [
    count("reserve") && `${count("reserve")} в резерве`,
    count("returnStock") && `${count("returnStock")} возврат разобрать`,
  ].filter(Boolean);

  const unitRow = (u: Unit) => (
    <UnitRow key={u.order} unit={u} batch={batch(u.batchId)} modelName={model.name} size={sizeStock.size} />
  );

  return (
    <div className={styles.size} ref={ref}>
      <button
        type="button"
        className={`${styles.head} ${flash ? styles.flash : ""}`}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <SizeChip variant="tag" {...summarize(sizeStock, thresholdsFor(model))} />
        <Chevron up={open} />
        {summary.length > 0 && <span className={styles.summary}>{summary.join(" · ")}</span>}
      </button>

      <Collapse open={open} className={styles.lines}>
          {onShelf.length === 0 && <p className={styles.empty}>На складе нет</p>}
          {onShelf.map((s) => (
            <div key={s.batchId} className={styles.line}>
              <span className={styles.qty}>{s.qty} шт.</span>
              <StatusBadge tone="success">На складе</StatusBadge>
              <span>«{batch(s.batchId).name}»</span>
              {/* Сначала сколько стоит весь остаток этой поставки, потом цена за штуку. */}
              <span className={styles.value}>{formatRub(Math.round(s.qty * batch(s.batchId).price * 100) / 100)}</span>
              <span className={styles.secondary}>{formatRub(batch(s.batchId).price)} за шт.</span>
            </div>
          ))}
          {visible.map(unitRow)}
          {hidden.length > 0 && (
            <div>
              <button type="button" className={styles.toggle} aria-expanded={showAll} onClick={() => setShowAll(!showAll)}>
                {showAll ? "Скрыть" : "Показать всё"} ({hidden.length})
                <Chevron up={showAll} small />
              </button>
              <Collapse open={showAll} className={styles.hiddenGroup}>
                {hidden.map(unitRow)}
              </Collapse>
            </div>
          )}
      </Collapse>
    </div>
  );
}

function Chevron({ up, small }: { up: boolean; small?: boolean }) {
  const size = small ? 16 : 22;
  return (
    <svg
      className={`${styles.chevron} ${up ? styles.up : ""}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 9l7 7 7-7" />
    </svg>
  );
}
