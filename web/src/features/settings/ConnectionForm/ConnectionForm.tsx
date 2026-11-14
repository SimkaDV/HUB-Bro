import { useState } from "react";
import { Button, type StatusTone } from "@/shared/ui";
import { clearConnection, isFilled, saveConnection } from "../connections";
import type { ConnectionDef, SavedConnection } from "../connections";
import { formatSavedAt } from "../format";
import form from "../form.module.css";
import styles from "./ConnectionForm.module.css";

type Props = {
  def: ConnectionDef;
  saved: SavedConnection;
};

export function connectionStatus(def: ConnectionDef, saved: SavedConnection): { tone: StatusTone; label: string } {
  if (isFilled(def, saved.values)) return { tone: "success", label: "Данные внесены" };
  if (Object.keys(saved.values).length > 0) return { tone: "warning", label: "Заполнено не всё" };
  return { tone: "neutral", label: "Не подключено" };
}

/** Поля подключения (Авито, Telegram) с сохранением. */
export function ConnectionForm({ def, saved }: Props) {
  const [draft, setDraft] = useState(saved.values);
  const [shown, setShown] = useState<Set<string>>(new Set());

  const changed = def.fields.some((f) => (draft[f.key] ?? "").trim() !== (saved.values[f.key] ?? ""));
  const hasAny = Object.keys(saved.values).length > 0;

  const toggle = (key: string) =>
    setShown((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const clear = () => {
    if (!window.confirm(`Стереть данные подключения «${def.title}»?`)) return;
    clearConnection(def.id);
    setDraft({});
  };

  return (
    <form
      className={form.form}
      onSubmit={(e) => {
        e.preventDefault();
        saveConnection(def.id, draft);
      }}
    >
      {def.fields.map((f) => {
        const id = `${def.id}-${f.key}`;
        const hidden = f.secret && !shown.has(f.key);
        return (
          <div key={f.key} className={form.field}>
            <label htmlFor={id} className={form.label}>
              {f.label}
              {f.optional && <span className={form.optional}> · необязательно</span>}
            </label>
            <div className={styles.inputRow}>
              <input
                id={id}
                className={form.input}
                type={hidden ? "password" : "text"}
                value={draft[f.key] ?? ""}
                placeholder={f.placeholder}
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
              />
              {f.secret && (
                <Button variant="secondary" className={styles.reveal} onClick={() => toggle(f.key)}>
                  {hidden ? "Показать" : "Скрыть"}
                </Button>
              )}
            </div>
            <span className={form.hint}>{f.hint}</span>
          </div>
        );
      })}

      <div className={form.footer}>
        <span className={form.saved}>{formatSavedAt(saved.savedAt)}</span>
        <div className={form.actions}>
          {hasAny && !changed && (
            <Button variant="secondary" className={form.onCard} onClick={clear}>
              Стереть
            </Button>
          )}
          {changed && (
            <Button variant="secondary" className={form.onCard} onClick={() => setDraft(saved.values)}>
              Отменить
            </Button>
          )}
          <Button type="submit" disabled={!changed}>
            Сохранить
          </Button>
        </div>
      </div>
    </form>
  );
}
