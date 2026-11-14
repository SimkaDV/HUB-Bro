import { useState } from "react";
import { Input } from "@/shared/ui";
import { categorySizes, lineQty, lineSum } from "../delivery";
import { compareSizes, formatRub } from "../stock";
import type { DeliveryLine, Model } from "../types";
import styles from "./DeliveryLineCard.module.css";

type Props = {
  line: DeliveryLine;
  models: Model[];
  onChange: (line: DeliveryLine) => void;
  onRemove: () => void;
};

/** Одна модель в поставке: цена и сколько каких размеров пришло. */
export function DeliveryLineCard({ line, models, onChange, onRemove }: Props) {
  const [newSize, setNewSize] = useState("");
  const model = models.find((m) => m.id === line.modelId);
  const categories = [...new Set(models.map((m) => m.category))];
  const suggested = model
    ? []
    : categorySizes(models, line.newModel.category.trim()).filter((s) => !line.sizes.includes(s));

  const setQty = (size: string, qty: number) =>
    onChange({ ...line, qty: { ...line.qty, [size]: Math.max(0, Math.min(999, qty)) } });

  const addSizes = (sizes: string[]) => {
    const fresh = sizes.filter((s) => s && !line.sizes.includes(s));
    if (fresh.length) onChange({ ...line, sizes: [...line.sizes, ...fresh].sort(compareSizes) });
  };

  const submitNewSize = () => {
    addSizes([newSize.trim().toUpperCase()]);
    setNewSize("");
  };

  const qty = lineQty(line);

  return (
    <section className={styles.card}>
      <div className={styles.head}>
        {model ? (
          <h3 className={styles.name}>{model.name}</h3>
        ) : (
          <div className={styles.newModel}>
            <span className={styles.badge}>Новая модель</span>
            <div className={styles.row}>
              <Input
                id={`name-${line.key}`}
                label="Название"
                placeholder="Джинсы Бананы"
                className={styles.onCard}
                value={line.newModel.name}
                onChange={(e) => onChange({ ...line, newModel: { ...line.newModel, name: e.target.value } })}
              />
              <Input
                id={`cat-${line.key}`}
                label="Категория"
                placeholder="Джинсы"
                list={`cats-${line.key}`}
                className={styles.onCard}
                value={line.newModel.category}
                onChange={(e) => onChange({ ...line, newModel: { ...line.newModel, category: e.target.value } })}
              />
              <datalist id={`cats-${line.key}`}>
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
          </div>
        )}
        <button type="button" className={styles.remove} onClick={onRemove} aria-label="Убрать модель из поставки">
          ✕
        </button>
      </div>

      <Input
        id={`price-${line.key}`}
        label="Цена за штуку, ₽"
        inputMode="decimal"
        placeholder="1 450"
        className={`${styles.onCard} ${styles.price}`}
        value={line.price}
        onChange={(e) => onChange({ ...line, price: e.target.value.replace(/[^\d\s.,]/g, "") })}
      />

      {line.sizes.length > 0 && (
        <div className={styles.sizes}>
          {line.sizes.map((s) => {
            const value = line.qty[s] ?? 0;
            return (
              <div key={s} className={`${styles.size} ${value > 0 ? styles.filled : ""}`}>
                <span className={styles.sizeName}>{s}</span>
                <div className={styles.stepper}>
                  <button type="button" onClick={() => setQty(s, value - 1)} disabled={value === 0} aria-label={`Убавить ${s}`}>
                    −
                  </button>
                  <input
                    inputMode="numeric"
                    aria-label={`Сколько пришло ${s}`}
                    value={value || ""}
                    placeholder="0"
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => setQty(s, Number(e.target.value.replace(/\D/g, "")) || 0)}
                  />
                  <button type="button" onClick={() => setQty(s, value + 1)} aria-label={`Прибавить ${s}`}>
                    +
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className={styles.addSize}>
        <input
          className={styles.addSizeInput}
          placeholder="Новый размер, например 35M"
          aria-label="Новый размер"
          value={newSize}
          onChange={(e) => setNewSize(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submitNewSize();
            }
          }}
        />
        <button type="button" className={styles.addSizeBtn} onClick={submitNewSize} disabled={!newSize.trim()}>
          + Размер
        </button>
      </div>

      {suggested.length > 0 && (
        <div className={styles.suggest}>
          <span>Размеры категории:</span>
          {suggested.map((s) => (
            <button key={s} type="button" onClick={() => addSizes([s])}>
              {s}
            </button>
          ))}
          <button type="button" className={styles.all} onClick={() => addSizes(suggested)}>
            Все
          </button>
        </div>
      )}

      <p className={styles.total}>
        <b>{qty} шт.</b>
        {lineSum(line) > 0 && <> · {formatRub(lineSum(line))}</>}
      </p>
    </section>
  );
}
