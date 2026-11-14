import type { ReactNode } from "react";
import styles from "./StatTiles.module.css";

export type Tile = {
  label: string;
  value: ReactNode;
  /** Мелкая строка под цифрой: разбивка по товарам, службам, штукам. */
  detail?: ReactNode;
  /** Красная, пока есть что разбирать. */
  alert?: boolean;
  onClick?: () => void;
};

/** Плитки-сводка с цифрами: комплектация, пульт. */
export function StatTiles({ tiles }: { tiles: Tile[] }) {
  return (
    <div className={styles.tiles}>
      {tiles.map((t) => {
        const className = [styles.tile, t.alert ? styles.alert : "", t.onClick ? styles.clickable : ""].join(" ");
        const body = (
          <>
            <span className={styles.label}>{t.label}</span>
            <span className={styles.value}>{t.value}</span>
            {t.detail && <span className={styles.detail}>{t.detail}</span>}
          </>
        );
        return t.onClick ? (
          <button key={t.label} type="button" className={className} onClick={t.onClick}>
            {body}
          </button>
        ) : (
          <div key={t.label} className={className}>
            {body}
          </div>
        );
      })}
    </div>
  );
}
