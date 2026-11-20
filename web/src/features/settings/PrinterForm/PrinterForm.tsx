import { useEffect, useState } from "react";
import {
  DEFAULT_PRINTER,
  forgetPrinter,
  LABEL_LAYOUTS,
  ORIENTATIONS,
  outOfRange,
  pairPrinter,
  PRINTER_LIMITS,
  PRINTER_MODEL,
  PrinterError,
  printLabels,
  renderLabel,
  resetPrinter,
  SAMPLE_LABEL,
  savePrinter,
  usePrinterLink,
  type LabelLayout,
  type PrinterLinkState,
  type PrinterNumberKey,
  type PrinterSettings,
} from "@/shared/printer";
import { Button, FilterChip } from "@/shared/ui";
import { formatSavedAt } from "../format";
import form from "../form.module.css";
import styles from "./PrinterForm.module.css";

type Draft = Omit<PrinterSettings, "savedAt">;
type TestState = { kind: "idle" } | { kind: "sending" } | { kind: "sent"; at: Date } | { kind: "error"; text: string };

const LINK_HINT: Record<PrinterLinkState, string> = {
  unsupported: "Этот браузер не умеет печатать по USB. Открой кабинет в Chrome или Edge.",
  notPaired: "Воткни принтер по USB, включи его и нажми «Подключить принтер» — Chrome покажет список устройств.",
  notFound: "Принтер выбран, но сейчас не виден. Проверь кабель и питание — подхватится сам.",
  ready: "Принтер на связи. Chrome его запомнил — в следующий раз ничего нажимать не надо.",
};

const strip = ({ savedAt: _, ...rest }: PrinterSettings): Draft => rest;

const errorText = (e: unknown) => (e instanceof PrinterError ? e.message : `Ошибка: ${e instanceof Error ? e.message : String(e)}`);

/** Принтер Xprinter XP-365B: подключение по WebUSB, бирка, плотность и скорость, пробная печать. */
export function PrinterForm({ saved }: { saved: PrinterSettings }) {
  const link = usePrinterLink();
  const [draft, setDraft] = useState<Draft>(() => strip(saved));
  const [pairError, setPairError] = useState("");
  const [test, setTest] = useState<TestState>({ kind: "idle" });
  const [previews, setPreviews] = useState<Partial<Record<LabelLayout, string>>>({});
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const base = strip(saved);
  const changed = (Object.keys(base) as (keyof Draft)[]).some((k) => draft[k] !== base[k]);
  const isDefault = (Object.keys(DEFAULT_PRINTER) as (keyof Draft)[]).every((k) => base[k] === DEFAULT_PRINTER[k]);
  const bad = outOfRange(draft);
  const canSave = changed && bad.length === 0;
  const sizeOk = !bad.includes("labelWidth") && !bad.includes("labelHeight");

  // Превью — та же картинка, что уйдёт на принтер, в его точках.
  const { labelWidth, labelHeight } = draft;
  useEffect(() => {
    if (!sizeOk) return;
    let alive = true;
    void Promise.all(
      LABEL_LAYOUTS.map(({ id }) =>
        renderLabel(SAMPLE_LABEL, { ...DEFAULT_PRINTER, layout: id, labelWidth, labelHeight }).then(
          (canvas) => [id, canvas.toDataURL()] as const,
        ),
      ),
    ).then((list) => alive && setPreviews(Object.fromEntries(list)));
    return () => {
      alive = false;
    };
  }, [labelWidth, labelHeight, sizeOk]);

  const pair = async () => {
    setPairError("");
    try {
      await pairPrinter();
    } catch (e) {
      setPairError(errorText(e));
    }
  };

  const unpair = async () => {
    if (!window.confirm("Отключить принтер? Этот браузер забудет все принтеры — потом нажмёшь «Подключить принтер» и выберешь заново.")) return;
    setPairError("");
    setTest({ kind: "idle" });
    await forgetPrinter();
  };

  const testPrint = async () => {
    setTest({ kind: "sending" });
    try {
      await printLabels([SAMPLE_LABEL], { ...draft });
      setTest({ kind: "sent", at: new Date() });
    } catch (e) {
      setTest({ kind: "error", text: errorText(e) });
    }
  };

  const numberField = (key: PrinterNumberKey, label: string, unit: string) => {
    const { min } = PRINTER_LIMITS[key];
    // Повёрнутая бирка идёт высотой поперёк ленты — высота не больше ширины печати.
    const max = key === "labelHeight" && draft.orientation === "vertical" ? PRINTER_LIMITS.labelWidth.max : PRINTER_LIMITS[key].max;
    const wrong = bad.includes(key);
    return (
      <label className={form.field}>
        <span className={form.label}>{label}</span>
        <span className={styles.unitInput}>
          <input
            className={`${form.input} ${wrong ? styles.bad : ""}`}
            type="number"
            inputMode="numeric"
            min={min}
            max={max}
            value={Number.isFinite(draft[key]) ? draft[key] : ""}
            onChange={(e) => set(key, e.target.value === "" ? NaN : Number(e.target.value))}
          />
          <span className={styles.unit}>{unit}</span>
        </span>
        <span className={`${form.hint} ${wrong ? styles.badHint : ""}`}>
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
        <b>{PRINTER_MODEL}</b> — термопринтер бирок: 203 dpi, лента до 80 мм. Наша бирка — 40×58 мм. Печатаем прямо из Chrome по USB, без
        драйвера и программ.
      </p>

      <fieldset className={styles.group}>
        <legend className={form.label}>Подключение</legend>
        <div className={styles.linkRow}>
          <span className={styles.linkText}>
            <span className={styles.linkName}>{link.name ?? "Принтер не выбран"}</span>
            <span className={form.hint}>{LINK_HINT[link.state]}</span>
          </span>
          {link.state !== "unsupported" && (
            <span className={styles.linkActions}>
              {link.state !== "notPaired" && (
                <Button variant="secondary" onClick={unpair}>
                  Отключить принтер
                </Button>
              )}
              <Button variant="secondary" onClick={pair}>
                {link.state === "notPaired" ? "Подключить принтер" : "Выбрать другой"}
              </Button>
            </span>
          )}
        </div>
        {pairError && <p className={styles.error}>{pairError}</p>}
      </fieldset>

      <fieldset className={styles.group}>
        <legend className={form.label}>Бирка</legend>
        <div className={styles.grid}>
          {numberField("labelWidth", "Ширина", "мм")}
          {numberField("labelHeight", "Высота", "мм")}
          {numberField("gap", "Зазор", "мм")}
        </div>
        <div className={styles.layouts} role="radiogroup" aria-label="Раскладка бирки">
          {LABEL_LAYOUTS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={draft.layout === id}
              className={`${styles.layout} ${draft.layout === id ? styles.picked : ""}`}
              onClick={() => set("layout", id)}
            >
              {previews[id] && sizeOk ? (
                <img className={styles.sticker} src={previews[id]} alt={`Бирка «${label}»: так она выйдет на бумаге`} />
              ) : (
                <span className={styles.noPreview}>{sizeOk ? "" : "Размер вне границ"}</span>
              )}
              <span className={styles.layoutName}>{label}</span>
            </button>
          ))}
        </div>
        <span className={form.hint}>
          Так выйдет на бумаге (пример заказа). Печатается выбранная. Номер — N и 6 последних цифр заказа Авито, после
          дефиса код модели со склада; штрихкод — номер отправления.
        </span>
      </fieldset>

      <fieldset className={styles.group}>
        <legend className={form.label}>Печать</legend>
        <div className={styles.grid}>
          {numberField("density", "Плотность", "")}
          {numberField("speed", "Скорость", "дюйм/с")}
        </div>
        <div className={styles.orientation}>
          <span className={form.label}>Ориентация печати</span>
          <div className={styles.chips} role="group" aria-label="Ориентация печати">
            {ORIENTATIONS.map(({ id, label }) => (
              <FilterChip key={id} label={label} selected={draft.orientation === id} onClick={() => set("orientation", id)} />
            ))}
          </div>
          <span className={form.hint}>
            {draft.orientation === "vertical"
              ? "Бирку поворачиваем на 90° — для ленты, которая идёт широкой стороной поперёк. Вышла боком — выбери «Горизонтальная»."
              : "Бирка уходит как нарисована, без поворота. Вышла боком — выбери «Вертикальная»."}
          </span>
        </div>
        <label className={styles.check}>
          <input type="checkbox" checked={draft.flip} onChange={(e) => set("flip", e.target.checked)} />
          Перевернуть бирку — если выходит вверх ногами
        </label>
        <span className={form.hint}>Бледно — прибавь плотность, штрихкод смазывается — убавь скорость.</span>
      </fieldset>

      {test.kind !== "idle" && (
        <p className={test.kind === "error" ? styles.error : styles.testNote} role="status">
          {test.kind === "sending" && "Отправляем бирку…"}
          {test.kind === "sent" &&
            `Отправлено в ${test.at.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}. Не вышла — проверь ленту и крышку.`}
          {test.kind === "error" && test.text}
        </p>
      )}

      <div className={form.footer}>
        <span className={form.saved}>{formatSavedAt(saved.savedAt)}</span>
        <div className={form.actions}>
          <Button
            variant="secondary"
            className={form.onCard}
            disabled={link.state !== "ready" || bad.length > 0 || test.kind === "sending"}
            title={link.state === "ready" ? "Одна бирка-пример с текущими значениями, даже несохранёнными" : "Сначала подключи принтер"}
            onClick={testPrint}
          >
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
