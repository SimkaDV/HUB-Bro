import { useState } from "react";
import { importAvitoText, reportSummary, reportWarnings } from "@/shared/avito";
import { Button } from "@/shared/ui";
import form from "../form.module.css";
import styles from "./AvitoExtension.module.css";

/** Как поставить расширение и запасной путь — вставить заказы, скопированные на странице Авито. */
export function AvitoExtension({ version }: { version?: string }) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<{ ok: boolean; lines: string[] } | null>(null);

  const paste = () => {
    const r = importAvitoText(text.trim());
    if (typeof r === "string") setResult({ ok: false, lines: [r] });
    else {
      setResult({ ok: true, lines: [reportSummary(r), ...reportWarnings(r).map((w) => `⚠ ${w}`)] });
      setText("");
    }
  };

  return (
    <div className={form.form}>
      {version ? (
        <p className={styles.text}>Расширение {version} на связи. Заказы подтягиваются кнопкой на «Заказах» или на странице заказов Авито.</p>
      ) : (
        <ol className={styles.steps}>
          <li>
            Откройте <code>chrome://extensions</code> и включите «Режим разработчика» справа сверху.
          </li>
          <li>
            «Загрузить распакованное» → папка <code>extension</code> из проекта HUB BRO. Уже стоит — обновите папку
            и нажмите у расширения «Обновить»: сайт видит версия 0.2.0 и новее.
          </li>
          <li>Войдите в Авито в этом же Chrome и обновите эту страницу.</li>
        </ol>
      )}

      <label className={form.field}>
        <span className={form.label}>
          Вставить заказы <span className={form.optional}>— если кнопка «Скопировать» на Авито</span>
        </span>
        <textarea
          className={`${form.input} ${styles.area}`}
          placeholder="Вставьте сюда то, что скопировали на странице заказов Авито"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      {result && (
        <div className={result.ok ? form.hint : styles.error}>
          {result.lines.map((l) => (
            <p key={l}>{l}</p>
          ))}
        </div>
      )}
      <div className={form.footer}>
        <Button disabled={text.trim() === ""} onClick={paste}>
          Принять заказы
        </Button>
      </div>
    </div>
  );
}
