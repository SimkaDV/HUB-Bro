import type { ChangeSettings } from "../store";
import type { DisplaySettings } from "@/shared/stock";
import styles from "./DisplaySettingsPanel.module.css";

type Props = {
  display: DisplaySettings;
  change: ChangeSettings;
};

/** Как выглядит сетка остатков. Порядок плиток всегда авто — по срочности. */
export function DisplaySettingsPanel({ display, change }: Props) {
  const set = <K extends keyof DisplaySettings>(key: K, value: DisplaySettings[K], text: string) =>
    change(`Отображение: ${text}`, (s) => ({ display: { ...s.display, [key]: value } }));

  return (
    <div className={styles.panel}>
      <label className={styles.toggle}>
        <input
          type="checkbox"
          checked={display.showZeroOnTiles}
          onChange={(e) =>
            set("showZeroOnTiles", e.target.checked, e.target.checked ? "размеры с нулём на плитках показываются" : "размеры с нулём на плитках скрыты")
          }
        />
        <span>
          <b>Размеры с нулём на плитках</b>
          <small>Выключено — на плитке только то, что есть или едет. В раскрытой модели нули видны всегда.</small>
        </span>
      </label>

      <label className={styles.toggle}>
        <input
          type="checkbox"
          checked={display.showIncoming}
          onChange={(e) =>
            set("showIncoming", e.target.checked, e.target.checked ? "«+N» возвратов в пути показывается" : "«+N» возвратов в пути скрыт")
          }
        />
        <span>
          <b>«+N» — возвраты, которые едут к нам</b>
          <small>Мелкая цифра рядом с остатком на чипе.</small>
        </span>
      </label>

      <div className={styles.option}>
        <span>
          <b>Рядов чипов на плитке</b>
          <small>По 3 чипа в ряд. Не влезают — последний чип «+N».</small>
        </span>
        <div className={styles.segmented} role="radiogroup" aria-label="Рядов чипов на плитке">
          {([2, 3] as const).map((rows) => (
            <button
              key={rows}
              type="button"
              role="radio"
              aria-checked={display.tileRows === rows}
              className={display.tileRows === rows ? styles.active : ""}
              onClick={() => display.tileRows !== rows && set("tileRows", rows, `рядов чипов на плитке — ${rows}`)}
            >
              {rows}
            </button>
          ))}
        </div>
      </div>

      <p className={styles.note}>Порядок плиток — автоматически, по срочности: сверху модели, где больше всего горит.</p>
    </div>
  );
}
