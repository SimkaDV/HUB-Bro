import { useState } from "react";
import { Button, FilterChip, Input } from "@/shared/ui";
import { compareSizes, formatSize, isSizeNumber, type Category, type Model, type SizeLabel } from "@/shared/stock";
import type { ChangeSettings } from "../store";
import styles from "./SizeScalePanel.module.css";

// Буквы размеров — свои у каждой категории (Category.labels: {"30": "M"}): у джинсов 30 = M, у другой категории
// 30 может быть S. Везде показывается «30 (M)», бот называет размеры покупателям так же. Нет буквы у категории —
// берётся буква из шкалы магазина (catalog.sizeScale), если она там есть. Описание — docs/WAREHOUSE.md, «Размеры».

/** Буквы размера: латиница и цифры, до 4 знаков, заглавными («2XS», «XL»). Пусто — без букв. */
export const normalizeLabel = (s: string) => s.trim().toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 4);

type Props = {
  sizeScale: SizeLabel[];
  categories: Category[];
  models: Model[];
  change: ChangeSettings;
};

export function SizeScalePanel({ sizeScale, categories, models, change }: Props) {
  const [picked, setPicked] = useState(categories[0]?.id ?? "");
  const category = categories.find((c) => c.id === picked) ?? categories[0];
  const [newSize, setNewSize] = useState("");
  const [newLabel, setNewLabel] = useState("");

  if (!category) {
    return <p className={styles.hint}>Сначала заведите категорию (вкладка «Категории») — буквы размеров у каждой категории свои.</p>;
  }

  // Размеры категории: её шаблон и все размеры её моделей.
  const sizes = [
    ...new Set([...category.sizes, ...models.filter((m) => m.categoryId === category.id).flatMap((m) => m.sizes.map((s) => s.size))]),
  ].sort(compareSizes);
  const labels = category.labels ?? {};
  const fallback = (size: string) => sizeScale.find((s) => s.size === size)?.label ?? "";

  const size = newSize.trim();
  const problem = !size ? null : !isSizeNumber(size) ? "Размер — только число: 30" : sizes.includes(size) ? "Такой размер уже есть" : null;

  const patchCategory = (text: string, update: (c: Category) => Category) =>
    change(text, (s) => ({ categories: s.categories.map((c) => (c.id === category.id ? update(c) : c)) }));

  const withLabel = (c: Category, sz: string, label: string): Category => {
    const next = { ...(c.labels ?? {}) };
    if (label) next[sz] = label;
    else delete next[sz];
    return { ...c, labels: next };
  };

  const setLabel = (sz: string, raw: string) => {
    const label = normalizeLabel(raw);
    if (label === (labels[sz] ?? "")) return;
    patchCategory(
      label
        ? `«${category.name}»: размер ${sz} — буквы «${label}»${labels[sz] ? ` (было «${labels[sz]}»)` : ""}`
        : `«${category.name}»: у размера ${sz} убраны буквы`,
      (c) => withLabel(c, sz, label),
    );
  };

  const add = () => {
    if (!size || problem) return;
    const label = normalizeLabel(newLabel);
    patchCategory(`«${category.name}»: добавлен размер ${label ? `${size} (${label})` : size}`, (c) =>
      withLabel({ ...c, sizes: [...c.sizes, size].sort(compareSizes) }, size, label),
    );
    setNewSize("");
    setNewLabel("");
  };

  return (
    <div className={styles.panel}>
      <p className={styles.hint}>
        Буквы размеров у <b>каждой категории свои</b>: у джинсов 30 может быть M, у другой категории — S. Они видны
        везде как «30 (M)» — на складе, в заказах и <b>у бота</b>: он называет размеры покупателям так же.
      </p>

      {categories.length > 1 && (
        <div className={styles.cats}>
          {categories.map((c) => (
            <FilterChip key={c.id} label={c.name} selected={c.id === category.id} onClick={() => setPicked(c.id)} />
          ))}
        </div>
      )}

      {sizes.length === 0 ? (
        <p className={styles.hint}>У категории «{category.name}» пока нет размеров — добавьте их ниже.</p>
      ) : (
        <div className={styles.list} key={category.id}>
          {sizes.map((sz) => (
            <label key={sz} className={styles.row}>
              <span className={styles.size}>{sz}</span>
              <input
                key={labels[sz] ?? "" /* после сохранения поле показывает сохранённое */}
                className={styles.label}
                defaultValue={labels[sz] ?? ""}
                placeholder={fallback(sz) || "—"}
                maxLength={6}
                aria-label={`Буквы размера ${sz} в категории ${category.name}`}
                onBlur={(e) => setLabel(sz, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                }}
              />
              <span className={styles.preview}>{formatSize(sz, sizeScale, labels)}</span>
            </label>
          ))}
        </div>
      )}

      <div className={styles.addForm}>
        <Input label={`Новый размер в «${category.name}»`} value={newSize} onChange={(e) => setNewSize(e.target.value)} placeholder="35" inputMode="numeric" />
        <Input label="Буквы" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="XL" />
        <Button onClick={add} disabled={!size || !!problem}>
          Добавить размер
        </Button>
        {problem && <span className={styles.problem}>{problem}</span>}
      </div>
    </div>
  );
}
