import type { ReactNode } from "react";
import { Collapse, StatusBadge, type StatusTone } from "@/shared/ui";
import styles from "./SettingsSection.module.css";

type Props = {
  title: string;
  description: string;
  status: { tone: StatusTone; label: string };
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
};

/** Раскрывающийся раздел настроек: шапка со статусом, по клику — содержимое. */
export function SettingsSection({ title, description, status, open, onToggle, children }: Props) {
  return (
    <section className={styles.section}>
      <button type="button" className={styles.head} aria-expanded={open} onClick={onToggle}>
        <span className={styles.text}>
          <span className={styles.title}>{title}</span>
          <span className={styles.description}>{description}</span>
        </span>
        <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
        <span className={`${styles.chevron} ${open ? styles.up : ""}`} aria-hidden>
          ▾
        </span>
      </button>
      <Collapse open={open} className={styles.body}>
        {children}
      </Collapse>
    </section>
  );
}
