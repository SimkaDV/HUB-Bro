import { useState } from "react";
import { Button, Card, StatusBadge } from "@/shared/ui";
import { clearConnection, isFilled, saveConnection } from "../connections";
import type { ConnectionDef, SavedConnection } from "../connections";
import styles from "./ConnectionCard.module.css";

type Props = {
  def: ConnectionDef;
  saved: SavedConnection;
};

const dateFormat = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

export function ConnectionCard({ def, saved }: Props) {
  const [draft, setDraft] = useState(saved.values);
  const [shown, setShown] = useState<Set<string>>(new Set());

  const changed = def.fields.some((f) => (draft[f.key] ?? "").trim() !== (saved.values[f.key] ?? ""));
  const filled = isFilled(def, saved.values);
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
    <Card className={styles.card}>
      <div className={styles.head}>
        <div>
          <h2 className={styles.title}>{def.title}</h2>
          <p className={styles.description}>{def.description}</p>
        </div>
        {filled ? (
          <StatusBadge tone="success">Данные внесены</StatusBadge>
        ) : hasAny ? (
          <StatusBadge tone="warning">Заполнено не всё</StatusBadge>
        ) : (
          <StatusBadge tone="neutral">Не подключено</StatusBadge>
        )}
      </div>

      <form
        className={styles.fields}
        onSubmit={(e) => {
          e.preventDefault();
          saveConnection(def.id, draft);
        }}
      >
        {def.fields.map((f) => {
          const id = `${def.id}-${f.key}`;
          const hidden = f.secret && !shown.has(f.key);
          return (
            <div key={f.key} className={styles.field}>
              <label htmlFor={id} className={styles.label}>
                {f.label}
                {f.optional && <span className={styles.optional}> · необязательно</span>}
              </label>
              <div className={styles.inputRow}>
                <input
                  id={id}
                  className={styles.input}
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
              <span className={styles.hint}>{f.hint}</span>
            </div>
          );
        })}

        <div className={styles.footer}>
          <span className={styles.saved}>
            {saved.savedAt ? `Сохранено ${dateFormat.format(new Date(saved.savedAt))}` : "Ещё не сохраняли"}
          </span>
          <div className={styles.actions}>
            {hasAny && !changed && (
              <Button variant="secondary" onClick={clear}>
                Стереть
              </Button>
            )}
            {changed && (
              <Button variant="secondary" onClick={() => setDraft(saved.values)}>
                Отменить
              </Button>
            )}
            <Button type="submit" disabled={!changed}>
              Сохранить
            </Button>
          </div>
        </div>
      </form>
    </Card>
  );
}
