import { SizeChip } from "../SizeChip/SizeChip";
import { categoryName, useStockSettings } from "../settings";
import { listingsCount, useListings } from "@/shared/listings";
import { sizesByAttention, useStock } from "@/shared/stock";
import type { Model } from "@/shared/stock";
import styles from "./ModelTile.module.css";

// По три чипа в ряд, рядов — из настроек отображения; если размеров больше, последний чип — «+N».
const CHIPS_PER_ROW = 3;

type Props = {
  model: Model;
  selected: boolean;
  onSelect: () => void;
  /** «+N»: открыть модель (не закрывает, если уже открыта) и показать её. */
  onExpand: () => void;
  onSizeClick: (size: string) => void;
};

// Клик по плитке открывает модель, клик по чипу — сразу нужный размер.
// Кнопка модели растянута на всю плитку, чипы лежат поверх неё.
export function ModelTile({ model, selected, onSelect, onExpand, onSizeClick }: Props) {
  const { thresholdsFor, display } = useStockSettings();
  const { categories } = useStock();
  const maxChips = display.tileRows * CHIPS_PER_ROW;
  const sizes = sizesByAttention(model, thresholdsFor(model)).filter(
    (s) => display.showZeroOnTiles || s.qty > 0 || s.incoming > 0,
  );
  const shown = sizes.length > maxChips ? sizes.slice(0, maxChips - 1) : sizes;
  const hidden = sizes.length - shown.length;
  const listings = useListings().listings.filter((l) => l.productId === model.id).length;

  return (
    <div className={`${styles.tile} ${selected ? styles.selected : ""}`}>
      <button type="button" className={styles.open} aria-expanded={selected} onClick={onSelect}>
        {model.name}
      </button>
      <span className={styles.category}>{categoryName(model, categories)}</span>
      {listings > 0 && <span className={styles.listings}>{listingsCount(listings)}</span>}
      <span className={styles.chips}>
        {shown.map((s) => (
          <SizeChip key={s.size} {...s} onClick={() => onSizeClick(s.size)} />
        ))}
        {hidden > 0 && (
          <button
            type="button"
            className={styles.more}
            onClick={onExpand}
            aria-label={`Открыть ${model.name} со всеми размерами`}
          >
            +{hidden}
          </button>
        )}
      </span>
    </div>
  );
}
