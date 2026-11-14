import styles from "./FilterChip.module.css";

type Props = {
  label: string;
  count?: number;
  selected: boolean;
  /** Красная подложка, пока есть что разбирать (чип «Проблемы»). */
  alert?: boolean;
  onClick: () => void;
};

export function FilterChip({ label, count, selected, alert, onClick }: Props) {
  const className = [styles.chip, selected ? styles.selected : alert ? styles.alert : ""].filter(Boolean).join(" ");
  return (
    <button type="button" className={className} aria-pressed={selected} onClick={onClick}>
      {label}
      {count !== undefined && <span className={styles.count}>{count}</span>}
    </button>
  );
}
