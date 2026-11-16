import { reportSummary, reportWarnings, useAvitoLink } from "@/shared/avito";
import styles from "./AvitoSync.module.css";

/** Что сейчас с подтягиванием из Авито: идёт сбор, ошибка или итог последнего приёма. */
export function AvitoSync() {
  const link = useAvitoLink();
  if (link.collecting) return <p className={styles.note}>{link.progress ?? "Собираю заказы в Авито…"}</p>;
  if (link.error) return <p className={`${styles.note} ${styles.error}`}>{link.error}</p>;
  if (!link.last) return null;
  return (
    <div className={styles.note}>
      <p>Из Авито — {reportSummary(link.last)}</p>
      {reportWarnings(link.last).map((w) => (
        <p key={w} className={styles.error}>
          ⚠ {w}
        </p>
      ))}
    </div>
  );
}
