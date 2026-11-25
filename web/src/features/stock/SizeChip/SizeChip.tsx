import { useStockSettings } from "../settings";
import { formatSize, useStock, type SizeSummary } from "@/shared/stock";
import styles from "./SizeChip.module.css";

type Props = SizeSummary & {
  /** compact — в плитке (размер над числом), tag — в строке размера (в одну линию). */
  variant?: "compact" | "tag";
  /** Если задан, чип — кнопка: переход к этому размеру. */
  onClick?: () => void;
  /** Буквы размеров категории товара — для «30 (M)». */
  labels?: Record<string, string>;
};

export function SizeChip({ size, qty, incoming, level, variant = "compact", onClick, labels }: Props) {
  const { display } = useStockSettings();
  const { sizeScale } = useStock();
  // В плитке места мало — только номер; в строке размера — с буквой из шкалы: «30 (M)».
  const label = variant === "tag" ? formatSize(size, sizeScale, labels) : size;
  const className = `${styles.chip} ${styles[variant]} ${onClick ? styles.clickable : ""}`;
  const content = (
    <>
      <span>{label}</span>
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
