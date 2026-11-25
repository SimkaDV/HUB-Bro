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
  hasBotData,
  nameTaken,
  normalizeCode,
  resolveThresholds,
} from "../settings";
import { listingsCount, unlinkModel, useListings } from "@/shared/listings";
import { compareSizes, formatSize, onHand, useStock } from "@/shared/stock";
import type { ChangeSettings } from "../store";
import type { Category, Model, Pack } from "@/shared/stock";
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
  const [code, setCode] = useState(model.code ?? "");
  useEffect(() => setCode(model.code ?? ""), [model.code]);

  const category = categories.find((c) => c.id === model.categoryId);
  const scale = useStock().sizeScale;
  const thresholds = resolveThresholds(model, categories);
  const totalOnHand = model.sizes.reduce((s, x) => s + onHand(x), 0);
  const listings = useListings().listings.filter((l) => l.productId === model.id).length;
  const nameProblem = !name.trim()
    ? "Впишите название"
    : name.trim() !== model.name && nameTaken(name, models.map((m) => m.name))
      ? "Такая модель уже есть"
      : null;

  // Код на бирке уникален среди всех моделей, в том числе архивных: по нему на расклейке понимают, что класть.
  const codeProblem =
    code && code !== model.code && models.some((m) => m.id !== model.id && m.code === code)
      ? "Такой код уже у другой модели"
      : null;

  const patch = (text: string, fn: (m: Model) => Model) =>
    change(text, (s) => ({ models: s.models.map((m) => (m.id === model.id ? fn(m) : m)) }));

  const commitName = () => {
    const next = name.trim();
    if (nameProblem || next === model.name) return setName(model.name);
    patch(`Модель «${model.name}» переименована в «${next}»`, (m) => ({ ...m, name: next }));
  };

  const commitCode = () => {
    const prev = model.code ?? "";
    if (codeProblem || code === prev) return setCode(prev);
    patch(`«${model.name}»: код на бирке ${prev || "—"} → ${code || "—"}`, ({ code: _, ...m }) => (code ? { ...m, code } : m));
  };

  const setSizeOrder = (order: string[], text: string) =>
    patch(text, (m) => ({ ...m, sizes: order.map((size) => m.sizes.find((s) => s.size === size)!) }));

  return (
    <article className={`${styles.card} ${model.archived ? styles.archived : ""}`}>
      <button type="button" className={styles.head} aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className={styles.title}>{model.name}</span>
        <span className={styles.meta}>
          {model.code ? `${model.code} · ` : ""}
          {category?.name ?? "Без категории"} · {model.sizes.length - (model.hiddenSizes?.length ?? 0)} разм. · {totalOnHand} шт. ·
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
              value={model.categoryId}
              onChange={(e) => {
                const next = categories.find((c) => c.id === e.target.value);
                if (!next) return;
                patch(`«${model.name}»: категория ${category?.name ?? "—"} → ${next.name}`, (m) => ({ ...m, categoryId: next.id }));
              }}
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <div className={styles.nameField}>
            <Input
              id={`model-code-${model.id}`}
              label="Код на бирке"
              className={styles.onCard}
              value={code}
              placeholder="КЛ"
              onChange={(e) => setCode(normalizeCode(e.target.value))}
              onBlur={commitCode}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            />
            {codeProblem ? (
              <span className={styles.problem}>{codeProblem}</span>
            ) : (
              <span className={styles.hint}>
                До 4 букв или цифр, пишется после номера заказа: N338871{code ? `-${code}` : "-КЛ"}
              </span>
            )}
          </div>
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
            scale={scale}
            labels={categories.find((c) => c.id === model.categoryId)?.labels}
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
              patch(`«${model.name}»: добавлен размер ${formatSize(size, scale, categories.find((c) => c.id === model.categoryId)?.labels)}`, (m) => ({
                ...m,
                sizes: [...m.sizes, { size, stock: [], units: [] }],
              }))
            }
            onDelete={(size) =>
              patch(`«${model.name}»: удалён размер ${size}`, (m) => ({
                ...m,
                sizes: m.sizes.filter((s) => s.size !== size),
                hiddenSizes: m.hiddenSizes?.filter((s) => s !== size),
                // Из пачек размер тоже уходит; пачка меньше чем из двух размеров уже не пачка.
                packs: m.packs
                  ?.map((p) => ({ ...p, sizes: p.sizes.filter((s) => s !== size) }))
                  .filter((p) => p.sizes.length >= 2),
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

        {model.packs && model.packs.length > 0 && (
          <section className={styles.section}>
            <h4>Пачки</h4>
            <p className={styles.hint}>
              Собираются в «+ Поставке». В пачке по одной штуке каждого размера. Удаление пачки не трогает склад и
              историю.
            </p>
            {model.packs.map((p) => (
              <PackRow
                key={p.id}
                pack={p}
                names={model.packs!.map((x) => x.name)}
                onRename={(next) =>
                  patch(`«${model.name}»: пачка «${p.name}» переименована в «${next}»`, (m) => ({
                    ...m,
                    packs: m.packs?.map((x) => (x.id === p.id ? { ...x, name: next } : x)),
                  }))
                }
                onDelete={() =>
                  patch(`«${model.name}»: удалена пачка «${p.name}»`, (m) => ({
                    ...m,
                    packs: m.packs?.filter((x) => x.id !== p.id),
                  }))
                }
              />
            ))}
          </section>
        )}

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
            <span className={styles.note}>
              {hasBotData(model)
                ? "У модели есть данные бота (описание, сетка, фото), поэтому её можно только убрать в архив."
                : "У модели есть поставки, поэтому её можно только убрать в архив."}
            </span>
          )}
        </div>
      </Collapse>
    </article>
  );
}

/** Пачка в настройках модели: переименовать и удалить. Состав не меняется — собрать новую в поставке. */
function PackRow({
  pack,
  names,
  onRename,
  onDelete,
}: {
  pack: Pack;
  names: string[];
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(pack.name);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => setName(pack.name), [pack.name]);
  const problem = !name.trim()
    ? "Впишите название"
    : name.trim().toLowerCase() !== pack.name.toLowerCase() && nameTaken(name, names)
      ? "Такая пачка уже есть"
      : null;

  const commit = () => {
    const next = name.trim();
    if (problem || next === pack.name) return setName(pack.name);
    onRename(next);
  };

  return (
    <div className={styles.pack}>
      <div className={styles.nameField}>
        <Input
          id={`pack-${pack.id}`}
          label={pack.sizes.join(" · ")}
          className={styles.onCard}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        />
        {problem && <span className={styles.problem}>{problem}</span>}
      </div>
      {confirm ? (
        <span className={styles.confirm}>
          Удалить пачку?
          <button type="button" className={styles.danger} onClick={onDelete}>
            Да, удалить
          </button>
          <button type="button" className={styles.link} onClick={() => setConfirm(false)}>
            Нет
          </button>
        </span>
      ) : (
        <button type="button" className={styles.link} onClick={() => setConfirm(true)}>
          Удалить
        </button>
      )}
    </div>
  );
}
