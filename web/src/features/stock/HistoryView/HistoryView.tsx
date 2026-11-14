import { useState } from "react";
import { StatusBadge } from "@/shared/ui";
import { canCancel, formatDay } from "../delivery";
import { compareSizes, formatRub } from "../stock";
import type { Model } from "../types";
import styles from "./HistoryView.module.css";

type Props = {
  models: Model[];
  onCancel: (modelId: string, batchId: string) => void;
};

/** История поставок: что, откуда, по какой цене, сколько каких размеров. */
export function HistoryView({ models, onCancel }: Props) {
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const entries = models
    .flatMap((model) => model.batches.map((batch) => ({ model, batch })))
    .sort((a, b) => b.batch.addedAt.localeCompare(a.batch.addedAt));

  if (entries.length === 0) return <p className={styles.empty}>Поставок пока нет.</p>;

  return (
    <div className={styles.list}>
      {entries.map(({ model, batch }) => {
        const qty = batch.delivered.reduce((s, d) => s + d.qty, 0);
        const cancellable = canCancel(model, batch);
        return (
          <article key={batch.id} className={`${styles.entry} ${batch.cancelledAt ? styles.cancelled : ""}`}>
            <div className={styles.head}>
              <span className={styles.date}>{formatDay(batch.date)}</span>
              <h3 className={styles.title}>Поставка · {model.name}</h3>
              {batch.cancelledAt && (
                <StatusBadge tone="danger">Отменена {formatDay(batch.cancelledAt.slice(0, 10))}</StatusBadge>
              )}
            </div>
            <p className={styles.meta}>
              «{batch.name}» · {batch.from} · {formatRub(batch.price)} за шт.
            </p>
            <div className={styles.sizes}>
              {[...batch.delivered]
                .sort((a, b) => compareSizes(a.size, b.size))
                .map((d) => (
                  <span key={d.size} className={styles.size}>
                    {d.size} <b>× {d.qty}</b>
                  </span>
                ))}
            </div>
            <div className={styles.foot}>
              <span>
                <b>+{qty} шт.</b> на {formatRub(qty * batch.price)}
              </span>
              {!batch.cancelledAt &&
                (cancellable ? (
                  confirmId === batch.id ? (
                    <span className={styles.confirm}>
                      Отменить поставку? Остатки уберутся со склада.
                      <button
                        type="button"
                        className={styles.danger}
                        onClick={() => {
                          onCancel(model.id, batch.id);
                          setConfirmId(null);
                        }}
                      >
                        Да, отменить
                      </button>
                      <button type="button" className={styles.link} onClick={() => setConfirmId(null)}>
                        Нет
                      </button>
                    </span>
                  ) : (
                    <button type="button" className={styles.link} onClick={() => setConfirmId(batch.id)}>
                      Отменить поставку
                    </button>
                  )
                ) : (
                  <span className={styles.locked}>Из поставки уже есть заказы — отменить нельзя</span>
                ))}
            </div>
          </article>
        );
      })}
    </div>
  );
}
