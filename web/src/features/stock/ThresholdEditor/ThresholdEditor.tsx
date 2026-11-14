import { useEffect, useState } from "react";
import { SizeChip } from "../SizeChip/SizeChip";
import { thresholdsProblem } from "../settings";
import { stockLevel } from "@/shared/stock";
import type { Thresholds } from "@/shared/stock";
import styles from "./ThresholdEditor.module.css";

type Props = {
  id: string;
  value: Thresholds;
  /** Вызывается, когда ввод закончен (ушли из поля / Enter) и значения правильные. */
  onCommit: (value: Thresholds) => void;
  disabled?: boolean;
};

/** Пороги «мало / норм» с живым примером, как покрасятся чипы. */
export function ThresholdEditor({ id, value, onCommit, disabled }: Props) {
  const [low, setLow] = useState(String(value.lowMax));
  const [mid, setMid] = useState(String(value.midMax));

  useEffect(() => {
    setLow(String(value.lowMax));
    setMid(String(value.midMax));
  }, [value.lowMax, value.midMax]);

  const draft = { lowMax: Number(low), midMax: Number(mid) };
  const problem = thresholdsProblem(draft);
  const preview = problem ? value : draft;

  const commit = () => {
    if (!problem && (draft.lowMax !== value.lowMax || draft.midMax !== value.midMax)) onCommit(draft);
  };

  const field = (label: string, v: string, set: (s: string) => void, suffix: string) => (
    <label className={styles.field} htmlFor={`${id}-${suffix}`}>
      <span>{label}</span>
      <input
        id={`${id}-${suffix}`}
        inputMode="numeric"
        className={styles.input}
        value={v}
        disabled={disabled}
        onChange={(e) => set(e.target.value.replace(/\D/g, "").slice(0, 4))}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && commit()}
      />
    </label>
  );

  const samples = [0, preview.lowMax, preview.midMax, preview.midMax + 1];

  return (
    <div className={`${styles.editor} ${disabled ? styles.disabled : ""}`}>
      <div className={styles.fields}>
        {field("Мало — до", low, setLow, "low")}
        {field("Норм — до", mid, setMid, "mid")}
        <div className={styles.preview} aria-label="Пример">
          {samples.map((q, i) => (
            <SizeChip key={i} size={["нет", "мало", "норм", "много"][i]} qty={q} incoming={0} level={stockLevel(q, preview)} />
          ))}
        </div>
      </div>
      {problem && !disabled && <p className={styles.problem}>{problem}</p>}
    </div>
  );
}
