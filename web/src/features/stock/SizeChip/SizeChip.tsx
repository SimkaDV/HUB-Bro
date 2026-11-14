import { useStockSettings } from "../settings";
import type { SizeSummary } from "../types";
import styles from "./SizeChip.module.css";

type Props = SizeSummary & {
  /** compact — в плитке (размер над числом), tag — в строке размера (в одну линию). */
  variant?: "compact" | "tag";
  /** Если задан, чип — кнопка: переход к этому размеру. */
  onClick?: () => void;
};

export function SizeChip({ size, qty, incoming, level, variant = "compact", onClick }: Props) {
  const { display } = useStockSettings();
  const className = `${styles.chip} ${styles[variant]} ${onClick ? styles.clickable : ""}`;
  const content = (
    <>
      <span>{size}</span>
      <span className={`${styles.qty} ${styles[level]}`}>
        {qty}
        {display.showIncoming && incoming > 0 && <small className={styles.incoming}>+{incoming}</small>}
      </span>
    </>
  );

  if (!onClick) return <span className={className}>{content}</span>;
  return (
    <button type="button" className={className} onClick={onClick} aria-label={`Открыть размер ${size}: ${qty} шт.`}>
      {content}
    </button>
  );
}
