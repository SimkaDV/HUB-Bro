import { SizeChip } from "../SizeChip/SizeChip";
import { sizesByAttention } from "../stock";
import type { Model } from "../types";
import styles from "./ModelTile.module.css";

// Два ряда по три чипа; если размеров больше, последний чип — «+N».
const MAX_CHIPS = 6;

type Props = {
  model: Model;
  selected: boolean;
  onSelect: () => void;
};

export function ModelTile({ model, selected, onSelect }: Props) {
  const sizes = sizesByAttention(model);
  const shown = sizes.length > MAX_CHIPS ? sizes.slice(0, MAX_CHIPS - 1) : sizes;
  const hidden = sizes.length - shown.length;

  return (
    <button
      type="button"
      className={`${styles.tile} ${selected ? styles.selected : ""}`}
      aria-expanded={selected}
      onClick={onSelect}
    >
      <span className={styles.name}>{model.name}</span>
      <span className={styles.category}>{model.category}</span>
      <span className={styles.chips}>
        {shown.map((s) => (
          <SizeChip key={s.size} {...s} />
        ))}
        {hidden > 0 && <span className={styles.more}>+{hidden}</span>}
      </span>
    </button>
  );
}
