import { useState } from "react";
import { Collapse, StatusBadge } from "@/shared/ui";
import { formatRub, formatSize, UNIT_STATUS, useStock } from "@/shared/stock";
import type { Batch, Unit } from "@/shared/stock";
import styles from "./UnitRow.module.css";

type Props = {
  unit: Unit;
  batch: Batch;
  modelName: string;
  size: string;
  /** Буквы размеров категории товара. */
  labels?: Record<string, string>;
};

/** Джинса с заказом; раскрывается в подробности. */
export function UnitRow({ unit, batch, modelName, size, labels }: Props) {
  const [open, setOpen] = useState(false);
  const status = UNIT_STATUS[unit.status];
  const { sizeScale } = useStock();

  return (
    <div className={styles.unit}>
      <button type="button" className={styles.row} aria-expanded={open} onClick={() => setOpen(!open)}>
        <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
        <span>заказ №{unit.order}</span>
        <span className={styles.secondary}>{status.hint ?? `«${batch.name}»`}</span>
      </button>
      <Collapse open={open}>
        <dl className={styles.info}>
          <dt>Товар</dt>
          <dd>
            {modelName}, {formatSize(size, sizeScale, labels)}
          </dd>
          <dt>Заказ</dt>
          <dd>
            №{unit.order} от {unit.orderDate}
          </dd>
          {unit.pickupPoint && (
            <>
              <dt>ПВЗ</dt>
              <dd>{unit.pickupPoint}</dd>
            </>
          )}
          <dt>Партия</dt>
          <dd>
            «{batch.name}» · {batch.from}
          </dd>
          <dt>Закупка</dt>
          <dd>{formatRub(batch.price)}</dd>
        </dl>
      </Collapse>
    </div>
  );
}
