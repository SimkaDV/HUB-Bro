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
  onSizeClick: (size: string) => void;
};

// Клик по плитке открывает модель, клик по чипу — сразу нужный размер.
// Кнопка модели растянута на всю плитку, чипы лежат поверх неё.
export function ModelTile({ model, selected, onSelect, onSizeClick }: Props) {
  const sizes = sizesByAttention(model);
  const shown = sizes.length > MAX_CHIPS ? sizes.slice(0, MAX_CHIPS - 1) : sizes;
  const hidden = sizes.length - shown.length;

  return (
    <div className={`${styles.tile} ${selected ? styles.selected : ""}`}>
      <button type="button" className={styles.open} aria-expanded={selected} onClick={onSelect}>
        {model.name}
      </button>
      <span className={styles.category}>{model.category}</span>
      <span className={styles.chips}>
        {shown.map((s) => (
          <SizeChip key={s.size} {...s} onClick={() => onSizeClick(s.size)} />
        ))}
        {hidden > 0 && <span className={styles.more}>+{hidden}</span>}
      </span>
    </div>
  );
}
