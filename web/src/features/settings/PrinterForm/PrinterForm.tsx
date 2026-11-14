import { useState } from "react";
import { Button } from "@/shared/ui";
import { DEFAULT_PRINTER, PRINTER_LIMITS, PRINTER_MODEL, resetPrinter, savePrinter } from "../connections";
import type { PrinterLink, PrinterSettings, PrintMethod } from "../connections";
import { formatSavedAt } from "../format";
import form from "../form.module.css";
import styles from "./PrinterForm.module.css";

type Draft = Omit<PrinterSettings, "savedAt">;
type NumberKey = keyof typeof PRINTER_LIMITS;

const METHODS: { id: PrintMethod; label: string; text: string }[] = [
  {
    id: "agent",
    label: "Print Agent",
    text: "Программа на компьютере склада сама печатает партии с пульта, без окон и драйвера. Нужен сервер.",
  },
  {
    id: "browser",
    label: "Окно печати браузера",
    text: "Пульт открывает обычное окно печати, бирки идут страницами. Работает сразу, но через драйвер и с кликом на каждую партию.",
  },
];

const LINKS: { id: PrinterLink; label: string }[] = [
  { id: "usb", label: "USB" },
  { id: "network", label: "Сеть" },
];

const strip = ({ savedAt: _, ...rest }: PrinterSettings): Draft => rest;

/** Предполагаемые настройки Xprinter XP-365B. Проверим, когда принтер будет на складе. */
export function PrinterForm({ saved }: { saved: PrinterSettings }) {
  const [draft, setDraft] = useState<Draft>(() => strip(saved));
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const base = strip(saved);
  const changed = (Object.keys(base) as (keyof Draft)[]).some((k) => draft[k] !== base[k]);
  const isDefault = (Object.keys(DEFAULT_PRINTER) as (keyof Draft)[]).every((k) => base[k] === DEFAULT_PRINTER[k]);
  const outOfRange = (Object.keys(PRINTER_LIMITS) as NumberKey[]).filter((k) => {
    const { min, max } = PRINTER_LIMITS[k];
    return !Number.isFinite(draft[k]) || draft[k] < min || draft[k] > max;
  });
  const agent = draft.method === "agent";
  const ipMissing = agent && draft.link === "network" && !draft.ip.trim();
  const canSave = changed && outOfRange.length === 0 && !ipMissing;

  const numberField = (key: NumberKey, label: string, unit: string) => {
    const { min, max } = PRINTER_LIMITS[key];
    const bad = outOfRange.includes(key);
    return (
      <label className={form.field}>
        <span className={form.label}>{label}</span>
        <span className={styles.unitInput}>
          <input
            className={`${form.input} ${bad ? styles.bad : ""}`}
            type="number"
            inputMode="numeric"
            min={min}
            max={max}
            value={Number.isFinite(draft[key]) ? draft[key] : ""}
            disabled={!agent && (key === "density" || key === "speed")}
            onChange={(e) => set(key, e.target.value === "" ? NaN : Number(e.target.value))}
          />
          <span className={styles.unit}>{unit}</span>
        </span>
        <span className={`${form.hint} ${bad ? styles.badHint : ""}`}>
          от {min} до {max}
        </span>
      </label>
    );
  };

  return (
    <form
      className={form.form}
      onSubmit={(e) => {
        e.preventDefault();
        if (canSave) savePrinter(draft);
      }}
    >
      <p className={styles.model}>
        <b>{PRINTER_MODEL}</b> — термопринтер бирок: 203 dpi, лента до 80 мм, подключается по USB, понимает команды TSPL.
      </p>

      <fieldset className={styles.group}>
        <legend className={form.label}>Как печатаем</legend>
        <div className={styles.methods}>
          {METHODS.map((m) => (
            <label key={m.id} className={`${styles.method} ${draft.method === m.id ? styles.picked : ""}`}>
              <input type="radio" name="print-method" checked={draft.method === m.id} onChange={() => set("method", m.id)} />
              <span className={styles.methodLabel}>{m.label}</span>
              <span className={form.hint}>{m.text}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {agent && (
        <fieldset className={styles.group}>
          <legend className={form.label}>Подключение принтера к компьютеру склада</legend>
          <div className={styles.segmented} role="radiogroup">
            {LINKS.map((l) => (
              <button
                key={l.id}
                type="button"
                role="radio"
                aria-checked={draft.link === l.id}
                className={draft.link === l.id ? styles.segActive : ""}
                onClick={() => set("link", l.id)}
              >
                {l.label}
              </button>
            ))}
          </div>
          {draft.link === "usb" ? (
            <label className={form.field}>
              <span className={form.label}>Имя принтера в системе</span>
              <input className={form.input} value={draft.name} onChange={(e) => set("name", e.target.value)} />
              <span className={form.hint}>Как принтер называется в списке принтеров компьютера склада</span>
            </label>
          ) : (
            <label className={form.field}>
              <span className={form.label}>IP-адрес принтера</span>
              <input
                className={form.input}
                value={draft.ip}
                placeholder="192.168.1.50"
                inputMode="decimal"
                onChange={(e) => set("ip", e.target.value)}
              />
              <span className={form.hint}>Только если у принтера есть сетевой порт (версия с LAN). Порт печати — 9100</span>
            </label>
          )}
        </fieldset>
      )}

      <fieldset className={styles.group}>
        <legend className={form.label}>Бирка</legend>
        <div className={styles.labelRow}>
          <div className={styles.grid}>
            {numberField("labelWidth", "Ширина", "мм")}
            {numberField("labelHeight", "Высота", "мм")}
            {numberField("gap", "Зазор", "мм")}
          </div>
          <div className={styles.preview} aria-hidden>
            <div
              className={styles.sticker}
              style={{ aspectRatio: `${draft.labelWidth || 1} / ${draft.labelHeight || 1}` }}
            >
              {draft.labelWidth || "?"} × {draft.labelHeight || "?"}
            </div>
          </div>
        </div>
      </fieldset>

      <fieldset className={styles.group}>
        <legend className={form.label}>Печать</legend>
        <div className={styles.grid}>
          {numberField("density", "Плотность", "")}
          {numberField("speed", "Скорость", "дюйм/с")}
        </div>
        <span className={form.hint}>
          {agent
            ? "Бледно — прибавь плотность, штрихкод смазывается — убавь скорость."
            : "При печати через браузер плотность и скорость задаются в драйвере принтера."}
        </span>
      </fieldset>

      <div className={form.footer}>
        <span className={form.saved}>{formatSavedAt(saved.savedAt)}</span>
        <div className={form.actions}>
          <Button variant="secondary" className={form.onCard} disabled title="Появится, когда подключим принтер">
            Пробная печать
          </Button>
          {changed ? (
            <Button variant="secondary" className={form.onCard} onClick={() => setDraft(base)}>
              Отменить
            </Button>
          ) : (
            !isDefault && (
              <Button
                variant="secondary"
                className={form.onCard}
                onClick={() => {
                  if (!window.confirm("Вернуть настройки принтера по умолчанию?")) return;
                  resetPrinter();
                  setDraft(strip(DEFAULT_PRINTER));
                }}
              >
                По умолчанию
              </Button>
            )
          )}
          <Button type="submit" disabled={!canSave}>
            Сохранить
          </Button>
        </div>
      </div>
    </form>
  );
}
