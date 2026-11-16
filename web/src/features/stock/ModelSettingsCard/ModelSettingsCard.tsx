import { useEffect, useState } from "react";
import { Collapse, Input } from "@/shared/ui";
import { ModelListings } from "../ModelListings/ModelListings";
import { SizeListEditor } from "../SizeListEditor/SizeListEditor";
import { ThresholdEditor } from "../ThresholdEditor/ThresholdEditor";
import {
  canDeleteModel,
  canDeleteSize,
  canHideSize,
  formatThresholds,
  nameTaken,
  resolveThresholds,
} from "../settings";
import { listingsCount, unlinkModel, useListings } from "@/shared/listings";
import { compareSizes, onHand } from "@/shared/stock";
import type { ChangeSettings } from "../store";
import type { Category, Model } from "@/shared/stock";
import styles from "./ModelSettingsCard.module.css";

type Props = {
  model: Model;
  models: Model[];
  categories: Category[];
  change: ChangeSettings;
};

/** Настройки одной модели: название, категория, пороги, размеры, архив. */
export function ModelSettingsCard({ model, models, categories, change }: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(model.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => setName(model.name), [model.name]);

  const category = categories.find((c) => c.name === model.category);
  const thresholds = resolveThresholds(model, categories);
  const totalOnHand = model.sizes.reduce((s, x) => s + onHand(x), 0);
  const listings = useListings().listings.filter((l) => l.modelId === model.id).length;
  const nameProblem = !name.trim()
    ? "Впишите название"
    : name.trim() !== model.name && nameTaken(name, models.map((m) => m.name))
      ? "Такая модель уже есть"
      : null;

  const patch = (text: string, fn: (m: Model) => Model) =>
    change(text, (s) => ({ models: s.models.map((m) => (m.id === model.id ? fn(m) : m)) }));

  const commitName = () => {
    const next = name.trim();
    if (nameProblem || next === model.name) return setName(model.name);
    patch(`Модель «${model.name}» переименована в «${next}»`, (m) => ({ ...m, name: next }));
  };

  const setSizeOrder = (order: string[], text: string) =>
    patch(text, (m) => ({ ...m, sizes: order.map((size) => m.sizes.find((s) => s.size === size)!) }));

  return (
    <article className={`${styles.card} ${model.archived ? styles.archived : ""}`}>
      <button type="button" className={styles.head} aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className={styles.title}>{model.name}</span>
        <span className={styles.meta}>
          {model.category} · {model.sizes.length - (model.hiddenSizes?.length ?? 0)} разм. · {totalOnHand} шт. ·
          пороги {formatThresholds(thresholds)}
          {model.thresholds ? " (свои)" : ""} · {listingsCount(listings)}
        </span>
        <svg className={`${styles.chevron} ${open ? styles.up : ""}`} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 9l7 7 7-7" />
        </svg>
      </button>

      <Collapse open={open} className={styles.body}>
        <div className={styles.row}>
          <div className={styles.nameField}>
            <Input
              id={`model-name-${model.id}`}
              label="Название"
              className={styles.onCard}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            />
            {nameProblem && <span className={styles.problem}>{nameProblem}</span>}
          </div>
          <label className={styles.field} htmlFor={`model-cat-${model.id}`}>
            <span>Категория</span>
            <select
              id={`model-cat-${model.id}`}
              className={styles.select}
              value={model.category}
              onChange={(e) => {
                const next = e.target.value;
                patch(`«${model.name}»: категория ${model.category} → ${next}`, (m) => ({ ...m, category: next }));
              }}
            >
              {categories.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <section className={styles.section}>
          <h4>Пороги «мало / норм»</h4>
          <div className={styles.radios}>
            <label>
              <input
                type="radio"
                name={`thr-${model.id}`}
                checked={!model.thresholds}
                onChange={() =>
                  patch(`«${model.name}»: пороги снова как у категории (${formatThresholds(category?.thresholds ?? thresholds)})`, (m) => ({
                    ...m,
                    thresholds: undefined,
                  }))
                }
              />
              Как у категории{category ? ` «${category.name}» (${formatThresholds(category.thresholds)})` : ""}
            </label>
            <label>
              <input
                type="radio"
                name={`thr-${model.id}`}
                checked={!!model.thresholds}
                onChange={() =>
                  patch(`«${model.name}»: свои пороги ${formatThresholds(thresholds)}`, (m) => ({ ...m, thresholds }))
                }
              />
              Свои для этой модели
            </label>
          </div>
          <ThresholdEditor
            id={`thr-${model.id}`}
            value={thresholds}
            disabled={!model.thresholds}
            onCommit={(t) =>
              patch(`«${model.name}»: пороги ${formatThresholds(thresholds)} → ${formatThresholds(t)}`, (m) => ({
                ...m,
                thresholds: t,
              }))
            }
          />
        </section>

        <section className={styles.section}>
          <h4>Размеры</h4>
          <p className={styles.hint}>
            Перетаскивайте, чтобы поменять порядок. Скрыть можно только размер, на котором нет джинс и заказов.
            Удалить — только размер, которого никогда не было в поставках.
          </p>
          <SizeListEditor
            items={model.sizes.map((s) => ({
              size: s.size,
              hidden: model.hiddenSizes?.includes(s.size),
              hideBlockedReason: canHideSize(model, s.size)
                ? undefined
                : "Нельзя скрыть: на размере есть джинсы или заказы",
              canDelete: canDeleteSize(model, s.size),
            }))}
            onReorder={(order) => setSizeOrder(order, `«${model.name}»: порядок размеров изменён`)}
            onAutoSort={() =>
              setSizeOrder(
                model.sizes.map((s) => s.size).sort(compareSizes),
                `«${model.name}»: размеры выстроены по порядку`,
              )
            }
            onAdd={(size) =>
              patch(`«${model.name}»: добавлен размер ${size}`, (m) => ({
                ...m,
                sizes: [...m.sizes, { size, stock: [], units: [] }],
              }))
            }
            onDelete={(size) =>
              patch(`«${model.name}»: удалён размер ${size}`, (m) => ({
                ...m,
                sizes: m.sizes.filter((s) => s.size !== size),
                hiddenSizes: m.hiddenSizes?.filter((s) => s !== size),
              }))
            }
            onToggleHidden={(size) => {
              const hidden = model.hiddenSizes?.includes(size);
              if (!hidden && !canHideSize(model, size)) return;
              patch(`«${model.name}»: размер ${size} ${hidden ? "снова показывается" : "скрыт"}`, (m) => ({
                ...m,
                hiddenSizes: hidden ? m.hiddenSizes?.filter((s) => s !== size) : [...(m.hiddenSizes ?? []), size],
              }));
            }}
          />
        </section>

        <section className={styles.section}>
          <h4>Объявления на Авито{listings > 0 ? ` (${listings})` : ""}</h4>
          <ModelListings model={model} change={change} />
        </section>

        <div className={styles.actions}>
          {model.archived ? (
            <button
              type="button"
              className={styles.action}
              onClick={() => patch(`«${model.name}» возвращена из архива`, (m) => ({ ...m, archived: false }))}
            >
              Вернуть из архива
            </button>
          ) : (
            <button
              type="button"
              className={styles.action}
              onClick={() => patch(`«${model.name}» убрана в архив`, (m) => ({ ...m, archived: true }))}
            >
              В архив
            </button>
          )}
          {canDeleteModel(model) &&
            (confirmDelete ? (
              <span className={styles.confirm}>
                Удалить модель насовсем?
                <button
                  type="button"
                  className={styles.danger}
                  onClick={() => {
                    unlinkModel(model.id);
                    change(`Модель «${model.name}» удалена`, (s) => ({ models: s.models.filter((m) => m.id !== model.id) }));
                  }}
                >
                  Да, удалить
                </button>
                <button type="button" className={styles.link} onClick={() => setConfirmDelete(false)}>
                  Нет
                </button>
              </span>
            ) : (
              <button type="button" className={styles.link} onClick={() => setConfirmDelete(true)}>
                Удалить
              </button>
            ))}
          {!canDeleteModel(model) && (
            <span className={styles.note}>У модели есть поставки, поэтому её можно только убрать в архив.</span>
          )}
        </div>
      </Collapse>
    </article>
  );
}
