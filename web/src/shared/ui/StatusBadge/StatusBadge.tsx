import type { ReactNode } from "react";
import styles from "./StatusBadge.module.css";

export type StatusTone = "danger" | "success" | "warning" | "neutral";

type Props = {
  tone: StatusTone;
  children: ReactNode;
};

// Статус всегда подписан текстом: цвет только подсказка, не единственный признак.
export function StatusBadge({ tone, children }: Props) {
  return <span className={`${styles.badge} ${styles[tone]}`}>{children}</span>;
}
