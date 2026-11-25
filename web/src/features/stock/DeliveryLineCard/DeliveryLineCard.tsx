import { useState } from "react";
import { Input } from "@/shared/ui";
import { addPack, categorySizes, lineCategory, lineCategoryText, linePacks, lineQty, lineTotal, packProblem, packQty, setLineCategory, unitPrice } from "../delivery";
import { compareSizes, formatRub, isSizeNumber } from "@/shared/stock";
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
  // Сборка пачки: открыта форма или нет, название и отмеченные размеры.
  const [packForm, setPackForm] = useState<{ name: string; sizes: string[] } | null>(null);
  const packs = linePacks(line);
  // «Очистить» обнуляет сумму, шаг и количества; модель и список размеров остаются.
  const hasData = line.total.trim() !== "" || line.step !== 1 || lineQty(line) > 0;
  const packFormProblem = packForm ? packProblem(line, models, packForm.name, packForm.sizes) : null;
  const model = models.find((m) => m.id === line.productId);
  const categoryNames = categories.map((c) => c.name);
  const newCategory = lineCategory(line, categories);
  const suggested = model
    ? []
    : (newCategory ? (newCategory.sizes.length ? newCategory.sizes : categorySizes(models, newCategory.id)) : []).filter(
        (s) => !line.sizes.includes(s),
      );

  const setQty = (size: string, qty: number) =>
    onChange({ ...line, qty: { ...line.qty, [size]: Math.max(0, Math.min(999, qty)) } });

  const setPackCount = (id: string, count: number) => {
    const next = packs.map((p) => (p.id === id ? { ...p, count: Math.max(0, Math.min(999, count)) } : p));
    // Размер пачки, которого нет в карточке (скрыт у модели), возвращаем в сетку — иначе штуки потеряются.
    const missing = next.filter((p) => p.count > 0).flatMap((p) => p.sizes).filter((s) => !line.sizes.includes(s));
    const sizes = missing.length ? [...line.sizes, ...new Set(missing)].sort(compareSizes) : line.sizes;
    onChange({ ...line, sizes, packs: next });
  };

  const openPackForm = () => setPackForm({ name: "", sizes: [...line.sizes] });

  const submitPack = () => {
    if (!packForm || packFormProblem) return;
    onChange(addPack(line, packForm.name, packForm.sizes));
    setPackForm(null);
  };

  const addSizes = (sizes: string[]) => {
    const fresh = sizes.filter((s) => s && !line.sizes.includes(s));
    if (fresh.length) onChange({ ...line, sizes: [...line.sizes, ...fresh].sort(compareSizes) });
  };

  // Размер — только номер (FORMAT.md); новый номер сам попадёт в шкалу магазина.
  const submitNewSize = () => {
    if (isSizeNumber(newSize.trim())) addSizes([newSize.trim()]);
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
                value={line.newProduct.name}
                onChange={(e) => onChange({ ...line, newProduct: { ...line.newProduct, name: e.target.value } })}
              />
              <Input
                id={`cat-${line.key}`}
                label="Категория"
                placeholder="Джинсы"
                list={`cats-${line.key}`}
                className={styles.onCard}
                value={lineCategoryText(line, categories)}
                onChange={(e) => onChange(setLineCategory(line, e.target.value, categories))}
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
          {packs.length === 0 && line.sizes.length > 0 && !packForm && (
            <button type="button" className={styles.packBtn} onClick={openPackForm}>
              Собрать пачку
            </button>
          )}
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
                  <p>Вы уверены? Сумма, пачки и все количества в карточке обнулятся.</p>
                  <div className={styles.popoverActions}>
                    <button
                      type="button"
                      className={styles.popoverYes}
                      onClick={() => {
                        setCustomStep("");
                        onChange({ ...line, total: "", step: 1, qty: {}, packs: packs.map((p) => ({ ...p, count: 0 })) });
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

      {packForm && (
        <div className={styles.packForm}>
          <span className={styles.packFormTitle}>Новая пачка</span>
          <input
            className={styles.addSizeInput}
            placeholder="Название, например Стандарт"
            aria-label="Название пачки"
            autoFocus
            value={packForm.name}
            onChange={(e) => setPackForm({ ...packForm, name: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submitPack();
              }
              if (e.key === "Escape") {
                e.stopPropagation();
                setPackForm(null);
              }
            }}
          />
          <span className={styles.packFormHint}>Размеры в пачке — по одной штуке каждого:</span>
          <div className={styles.packSizes}>
            {line.sizes.map((s) => {
              const on = packForm.sizes.includes(s);
              return (
                <button
                  key={s}
                  type="button"
                  aria-pressed={on}
                  className={`${styles.packSize} ${on ? styles.packSizeOn : ""}`}
                  onClick={() =>
                    setPackForm({ ...packForm, sizes: on ? packForm.sizes.filter((x) => x !== s) : [...packForm.sizes, s] })
                  }
                >
                  {s}
                </button>
              );
            })}
          </div>
          <div className={styles.packFormActions}>
            <button type="button" className={styles.addSizeBtn} onClick={submitPack} disabled={!!packFormProblem}>
              Собрать
            </button>
            <button type="button" className={styles.packCancel} onClick={() => setPackForm(null)}>
              Отмена
            </button>
            {packFormProblem && packForm.name.trim() && <span className={styles.packFormHint}>{packFormProblem}</span>}
          </div>
        </div>
      )}

      {packs.length > 0 && (
        <div className={styles.packs}>
          <div className={styles.packsHead}>
            <h4>Пачки</h4>
            {!packForm && (
              <button type="button" className={styles.packAdd} onClick={openPackForm}>
                + Добавить
              </button>
            )}
          </div>
          {packs.map((p) => (
            <div key={p.id} className={`${styles.pack} ${p.count > 0 ? styles.filled : ""}`}>
              <div className={styles.packText}>
                <span className={styles.packName}>
                  Пачка · <b>{p.name}</b>
                </span>
                <span className={styles.packList}>{p.sizes.join(" · ")}</span>
              </div>
              <div className={`${styles.stepper} ${styles.packStepper}`}>
                <button
                  type="button"
                  onClick={() => setPackCount(p.id, p.count - line.step)}
                  disabled={p.count === 0}
                  aria-label={`Убавить пачку ${p.name} на ${line.step}`}
                >
                  −
                </button>
                <input
                  inputMode="numeric"
                  aria-label={`Сколько пачек ${p.name}`}
                  value={p.count || ""}
                  placeholder="0"
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => setPackCount(p.id, Number(e.target.value.replace(/\D/g, "")) || 0)}
                />
                <button type="button" onClick={() => setPackCount(p.id, p.count + line.step)} aria-label={`Прибавить пачку ${p.name} на ${line.step}`}>
                  +
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {line.sizes.length > 0 && (
        <div className={styles.sizes}>
          {line.sizes.map((s) => {
            // value — отдельные штуки; fromPacks — штуки из пачек, их отсюда не убрать.
            const value = line.qty[s] ?? 0;
            const fromPacks = packQty(line, s);
            const shown = value ? (fromPacks > 0 ? `+${value}` : String(value)) : "";
            const both = fromPacks > 0 && value > 0;
            // «18 +16» не влезает в ячейку крупным шрифтом — чем длиннее, тем мельче, но всегда целиком.
            const chars = both ? String(fromPacks).length + shown.length : Math.max(shown.length, String(fromPacks).length);
            const fontSize = valueFontSize(chars);
            return (
              <div key={s} className={`${styles.size} ${value + fromPacks > 0 ? styles.filled : ""}`}>
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
                  <div className={styles.sizeValue} style={{ fontSize }}>
                    {both && (
                      <span className={styles.fromPacks} title="Из пачек">
                        {fromPacks}
                      </span>
                    )}
                    <input
                      inputMode="numeric"
                      aria-label={fromPacks > 0 ? `Сколько ${s} отдельно, сверх ${fromPacks} из пачек` : `Сколько пришло ${s}`}
                      title={fromPacks > 0 ? `${fromPacks} из пачек` : undefined}
                      value={shown}
                      // Поле шириной по тексту: серое число и «+N» стоят вплотную по центру.
                      style={both ? { width: `${shown.length + 0.4}ch` } : undefined}
                      placeholder={String(fromPacks)}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => setQty(s, Number(e.target.value.replace(/\D/g, "")) || 0)}
                    />
                  </div>
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
          placeholder="Новый размер, например 35"
          aria-label="Новый размер"
          inputMode="numeric"
          value={newSize}
          onChange={(e) => setNewSize(e.target.value.replace(/\D/g, "").slice(0, 3))}
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

/** Размер шрифта числа в ячейке размера по количеству знаков: 18 px до трёх знаков, дальше мельче. */
function valueFontSize(chars: number) {
  if (chars <= 3) return 18;
  if (chars === 4) return 16;
  if (chars === 5) return 14;
  if (chars === 6) return 12;
  return 11;
}
