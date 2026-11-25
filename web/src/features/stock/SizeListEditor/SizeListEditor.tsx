import { useState } from "react";
import { formatSize, isSizeNumber, type SizeLabel } from "@/shared/stock";
import styles from "./SizeListEditor.module.css";

export type SizeListItem = {
  size: string;
  hidden?: boolean;
  /** Почему размер нельзя скрыть; есть — кнопка «скрыть» неактивна. */
  hideBlockedReason?: string;
  canDelete: boolean;
};

type Props = {
  items: SizeListItem[];
  /** Шкала магазина: рядом с номером показываем букву — «30 (M)». */
  scale: SizeLabel[];
  /** Буквы размеров категории (главнее шкалы). */
  labels?: Record<string, string>;
  onReorder: (sizes: string[]) => void;
  onAutoSort: () => void;
  onAdd: (size: string) => void;
  onDelete: (size: string) => void;
  /** Нет — размеры нельзя скрывать (например, в шаблоне категории). */
  onToggleHidden?: (size: string) => void;
};

/** Размеры с перетаскиванием порядка, скрытием, удалением и добавлением. */
export function SizeListEditor({ items, scale, labels, onReorder, onAutoSort, onAdd, onDelete, onToggleHidden }: Props) {
  const [drag, setDrag] = useState<{ from: string; order: string[] } | null>(null);
  const [newSize, setNewSize] = useState("");
  const bySize = new Map(items.map((i) => [i.size, i]));
  const order = drag?.order ?? items.map((i) => i.size);

  const moveTo = (target: string) => {
    if (!drag || target === drag.from) return;
    // Встаём на место того размера, над которым сейчас тащим.
    const index = drag.order.indexOf(target);
    const next = drag.order.filter((s) => s !== drag.from);
    next.splice(index, 0, drag.from);
    setDrag({ ...drag, order: next });
  };

  const finishDrag = () => {
    if (drag && drag.order.join() !== items.map((i) => i.size).join()) onReorder(drag.order);
    setDrag(null);
  };

  const submit = () => {
    // Размер — только номер (FORMAT.md): новый номер сам попадёт в шкалу магазина, без буквы.
    const size = newSize.trim();
    if (isSizeNumber(size) && !bySize.has(size)) onAdd(size);
    setNewSize("");
  };

  return (
    <div className={styles.editor}>
      <div className={styles.list}>
        {order.map((size) => {
          const item = bySize.get(size)!;
          return (
            <div
              key={size}
              className={`${styles.chip} ${item.hidden ? styles.hidden : ""} ${drag?.from === size ? styles.dragging : ""}`}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = "move";
                setDrag({ from: size, order: items.map((i) => i.size) });
              }}
              onDragEnter={() => moveTo(size)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => e.preventDefault()}
              onDragEnd={finishDrag}
              title="Перетащите, чтобы поменять порядок"
            >
              <span className={styles.handle} aria-hidden="true">
                ⋮⋮
              </span>
              <span className={styles.size}>{formatSize(size, scale, labels)}</span>
              {onToggleHidden && (
                <button
                  type="button"
                  className={styles.icon}
                  onClick={() => onToggleHidden(size)}
                  disabled={!item.hidden && !!item.hideBlockedReason}
                  title={item.hidden ? "Показывать" : (item.hideBlockedReason ?? "Скрыть")}
                  aria-label={item.hidden ? `Показывать ${size}` : `Скрыть ${size}`}
                >
                  {item.hidden ? <EyeOff /> : <Eye />}
                </button>
              )}
              {item.canDelete && (
                <button
                  type="button"
                  className={styles.icon}
                  onClick={() => onDelete(size)}
                  title="Удалить размер"
                  aria-label={`Удалить ${size}`}
                >
                  ✕
                </button>
              )}
            </div>
          );
        })}
        {items.length === 0 && <span className={styles.empty}>Размеров пока нет</span>}
      </div>

      <div className={styles.actions}>
        <input
          className={styles.input}
          placeholder="Новый размер, номер"
          aria-label="Новый размер"
          inputMode="numeric"
          value={newSize}
          onChange={(e) => setNewSize(e.target.value.replace(/\D/g, "").slice(0, 3))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
        />
        <button type="button" className={styles.btn} onClick={submit} disabled={!newSize.trim()}>
          + Размер
        </button>
        <button type="button" className={styles.btnSecondary} onClick={onAutoSort} disabled={items.length < 2}>
          Выстроить по порядку
        </button>
      </div>
    </div>
  );
}

function Eye() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOff() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.8 9.8 0 0 0 5.4-1.6" />
    </svg>
  );
}
