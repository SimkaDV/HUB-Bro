import { useState } from "react";
import { Input } from "@/shared/ui";
import { categorySizes, lineQty, lineTotal, unitPrice } from "../delivery";
import { compareSizes, formatRub } from "@/shared/stock";
import type { Category, DeliveryLine, Model } from "@/shared/stock";
import styles from "./DeliveryLineCard.module.css";

type Props = {
  line: DeliveryLine;
  models: Model[];
  categories: Category[];
  onChange: (line: DeliveryLine) => void;
  onRemove: () => void;
};

// Готовые шаги для кнопок −/+; рядом можно вписать своё.
const STEPS = [1, 2, 5, 10];

/** Одна модель в поставке: сумма, шаг и сколько каких размеров пришло. */
export function DeliveryLineCard({ line, models, categories, onChange, onRemove }: Props) {
  const [newSize, setNewSize] = useState("");
  const [customStep, setCustomStep] = useState(STEPS.includes(line.step) ? "" : String(line.step));
  const [confirmClear, setConfirmClear] = useState(false);
  // «Очистить» обнуляет сумму, шаг и количества; модель и список размеров остаются.
  const hasData = line.total.trim() !== "" || line.step !== 1 || lineQty(line) > 0;
  const model = models.find((m) => m.id === line.modelId);
  const categoryNames = categories.map((c) => c.name);
  const newCategory = line.newModel.category.trim();
  const suggested = model
    ? []
    : (categories.find((c) => c.name === newCategory)?.sizes ?? categorySizes(models, newCategory)).filter(
        (s) => !line.sizes.includes(s),
      );

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
                {categoryNames.map((c) => (
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

      <div className={styles.controls}>
        <div className={styles.price}>
          <Input
            id={`total-${line.key}`}
            label="Сумма поставки, ₽"
            inputMode="decimal"
            placeholder="30 000"
            className={styles.onCard}
            value={line.total}
            onChange={(e) => onChange({ ...line, total: e.target.value.replace(/[^\d\s.,]/g, "") })}
          />
          <span className={styles.unit}>
            {unitPrice(line) > 0 ? `≈ ${formatRub(unitPrice(line))} за шт.` : "Цена за штуку посчитается сама"}
          </span>
        </div>

        <div className={styles.stepBlock}>
          <span className={styles.stepLabel}>Шаг −/+</span>
          <div className={styles.steps}>
            {STEPS.map((s) => (
              <button
                key={s}
                type="button"
                className={`${styles.stepBtn} ${line.step === s && !customStep ? styles.stepActive : ""}`}
                onClick={() => {
                  setCustomStep("");
                  onChange({ ...line, step: s });
                }}
              >
                {s}
              </button>
            ))}
            <input
              className={`${styles.stepInput} ${customStep ? styles.stepActive : ""}`}
              inputMode="numeric"
              placeholder="своё"
              aria-label="Свой шаг"
              value={customStep}
              onChange={(e) => {
                const value = e.target.value.replace(/\D/g, "").slice(0, 3);
                setCustomStep(value);
                onChange({ ...line, step: Number(value) || 1 });
              }}
            />
            <div className={styles.clearBlock}>
              <button
                type="button"
                className={styles.clearBtn}
                onClick={() => setConfirmClear(true)}
                disabled={!hasData}
                aria-label="Очистить карточку"
                title="Очистить"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
                </svg>
              </button>
              {confirmClear && (
                <div className={styles.popover} role="alertdialog" aria-label="Вы уверены?">
                  <p>Вы уверены? Сумма и все количества в карточке обнулятся.</p>
                  <div className={styles.popoverActions}>
                    <button
                      type="button"
                      className={styles.popoverYes}
                      onClick={() => {
                        setCustomStep("");
                        onChange({ ...line, total: "", step: 1, qty: {} });
                        setConfirmClear(false);
                      }}
                    >
                      Да
                    </button>
                    <button type="button" className={styles.popoverNo} autoFocus onClick={() => setConfirmClear(false)}>
                      Нет
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {line.sizes.length > 0 && (
        <div className={styles.sizes}>
          {line.sizes.map((s) => {
            const value = line.qty[s] ?? 0;
            return (
              <div key={s} className={`${styles.size} ${value > 0 ? styles.filled : ""}`}>
                <span className={styles.sizeName}>{s}</span>
                <div className={styles.stepper}>
                  <button
                    type="button"
                    onClick={() => setQty(s, value - line.step)}
                    disabled={value === 0}
                    aria-label={`Убавить ${s} на ${line.step}`}
                  >
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
                  <button type="button" onClick={() => setQty(s, value + line.step)} aria-label={`Прибавить ${s} на ${line.step}`}>
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
        {lineTotal(line) > 0 && <> · {formatRub(lineTotal(line))}</>}
        {unitPrice(line) > 0 && <> · {formatRub(unitPrice(line))} за шт.</>}
      </p>
    </section>
  );
}
