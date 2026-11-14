import { stockLevel } from "../stock";
import type { SizeSummary } from "../types";
import styles from "./SizeChip.module.css";

type Props = SizeSummary & {
  /** compact — в плитке (размер над числом), tag — в строке размера (в одну линию). */
  variant?: "compact" | "tag";
};

export function SizeChip({ size, qty, incoming, variant = "compact" }: Props) {
  return (
    <span className={`${styles.chip} ${styles[variant]}`}>
      <span>{size}</span>
      <span className={`${styles.qty} ${styles[stockLevel(qty)]}`}>
        {qty}
        {incoming > 0 && <small className={styles.incoming}>+{incoming}</small>}
      </span>
    </span>
  );
}
