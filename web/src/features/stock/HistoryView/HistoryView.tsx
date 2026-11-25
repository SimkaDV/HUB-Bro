import { useState } from "react";
import { StatusBadge } from "@/shared/ui";
import { canCancel, formatDay } from "../delivery";
import { compareSizes, formatRub } from "@/shared/stock";
import type { Batch, Model, SettingsLogEntry } from "@/shared/stock";
import styles from "./HistoryView.module.css";

type Props = {
  models: Model[];
  log: SettingsLogEntry[];
  onCancel: (modelId: string, batchId: string) => void;
};

type Entry =
  | { kind: "delivery"; at: string; model: Model; batch: Batch }
  | { kind: "settings"; at: string; entry: SettingsLogEntry };

type Filter = "all" | "delivery" | "settings";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Всё" },
  { id: "delivery", label: "Поставки" },
  { id: "settings", label: "Настройки" },
];

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** История склада: поставки (что, откуда, по какой цене, сколько каких размеров) и изменения настроек. */
export function HistoryView({ models, log, onCancel }: Props) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  const entries: Entry[] = [
    ...models.flatMap((model) => model.batches.map((batch) => ({ kind: "delivery" as const, at: batch.addedAt, model, batch }))),
    ...log.map((entry) => ({ kind: "settings" as const, at: entry.at, entry })),
  ]
    .filter((e) => filter === "all" || e.kind === filter)
    .sort((a, b) => b.at.localeCompare(a.at));

  return (
    <div className={styles.list}>
      <div className={styles.filters} role="tablist" aria-label="Что показывать">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={filter === f.id}
            className={filter === f.id ? styles.activeFilter : ""}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {entries.length === 0 && <p className={styles.empty}>Здесь пока пусто.</p>}

      {entries.map((e) => {
        if (e.kind === "settings")
          return (
            <article key={e.entry.id} className={styles.settingsEntry}>
              <span className={styles.time}>{formatDateTime(e.at)}</span>
              <span className={styles.tag}>Настройки</span>
              <span>{e.entry.source === "bot" ? `Бот: ${e.entry.text}` : e.entry.text}</span>
            </article>
          );
        const { model, batch } = e;
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
            {batch.packs && batch.packs.length > 0 && (
              <p className={styles.meta}>
                Из них пачки: {batch.packs.map((p) => `«${p.name}» × ${p.count}`).join(", ")}
              </p>
            )}
            <div className={styles.foot}>
              <span>
                <b>+{qty} шт.</b> на {formatRub(batch.total)}
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
