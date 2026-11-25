import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Input, StatusBadge } from "@/shared/ui";
import { DeliveryLineCard } from "../DeliveryLineCard/DeliveryLineCard";
import {
  batchNameFor,
  emptyLine,
  findDuplicate,
  formatDay,
  inputProblems,
  isInputReady,
  isModelVisible,
  lineModelName,
  linePacks,
  lineProblems,
  lineQty,
  lineTotal,
  shortModelName,
  sizeQty,
  todayIso,
  unitPrice,
} from "../delivery";
import { formatRub } from "@/shared/stock";
import type { Category, DeliveryDraft, DeliveryInput, Model } from "@/shared/stock";
import styles from "./DeliveryDialog.module.css";

type Props = {
  models: Model[];
  categories: Category[];
  drafts: DeliveryDraft[];
  onSubmit: (input: DeliveryInput, draftId?: string) => void;
  onSaveDraft: (input: DeliveryInput, draftId?: string) => string;
  onDeleteDraft: (id: string) => void;
  onClose: () => void;
};

// Длительность выезда/уезда панели, как в DeliveryDialog.module.css.
const SLIDE_MS = 240;

const emptyInput = (): DeliveryInput => ({ date: todayIso(), from: "", lines: [] });

export function DeliveryDialog({ models, categories, drafts, onSubmit, onSaveDraft, onDeleteDraft, onClose }: Props) {
  const [input, setInput] = useState<DeliveryInput>(emptyInput);
  const [draftId, setDraftId] = useState<string>();
  const [saved, setSaved] = useState(() => JSON.stringify(emptyInput()));
  const [step, setStep] = useState<"edit" | "review">("edit");
  const [closing, setClosing] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [draftNote, setDraftNote] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  const dirty = JSON.stringify(input) !== saved;
  const ready = isInputReady(input, models);
  const visibleModels = models.filter(isModelVisible);
  const pickable = visibleModels.filter((m) => !input.lines.some((l) => l.productId === m.id));
  const suppliers = useMemo(
    () => [...new Set(models.flatMap((m) => m.batches.map((b) => b.from)))].sort(),
    [models],
  );
  const firstProblem =
    inputProblems(input)[0] ?? input.lines.flatMap((l) => lineProblems(l, models))[0];

  const close = () => {
    setClosing(true);
    window.setTimeout(onClose, SLIDE_MS);
  };
  const requestClose = () => (dirty ? setConfirmClose(true) : close());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && requestClose();
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  });

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
  }, [step]);

  const update = (patch: Partial<DeliveryInput>) => {
    setInput((i) => ({ ...i, ...patch }));
    setConfirmClose(false);
  };

  const saveDraft = () => {
    const id = onSaveDraft(input, draftId);
    setDraftId(id);
    setSaved(JSON.stringify(input));
    setDraftNote(true);
    window.setTimeout(() => setDraftNote(false), 2000);
  };

  const openDraft = (d: DeliveryDraft) => {
    // По умолчанию всегда сегодня: дата из черновика остаётся, только если её выбирали руками.
    const next: DeliveryInput = d.dateSet
      ? { date: d.date, dateSet: true, from: d.from, lines: d.lines }
      : { date: todayIso(), from: d.from, lines: d.lines };
    setInput(next);
    setSaved(JSON.stringify(next));
    setDraftId(d.id);
  };

  const submit = () => {
    if (submitting) return; // защита от двойного нажатия
    setSubmitting(true);
    onSubmit(input, draftId);
    close();
  };

  const totalQty = input.lines.reduce((s, l) => s + lineQty(l), 0);
  const totalSum = input.lines.reduce((s, l) => s + (lineTotal(l) || 0), 0);

  return (
    <div className={`${styles.overlay} ${closing ? styles.closing : ""}`} onMouseDown={requestClose}>
      <div
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delivery-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className={styles.header}>
          <h2 id="delivery-title">{step === "edit" ? "Новая поставка" : "Проверьте поставку"}</h2>
          <button type="button" className={styles.close} onClick={requestClose} aria-label="Закрыть">
            ✕
          </button>
        </header>

        <div className={styles.body} ref={bodyRef}>
          {step === "edit" ? (
            <div className={styles.stepBody} key="edit">
              {drafts.length > 0 && !draftId && input.lines.length === 0 && (
                <section className={styles.drafts}>
                  <h3>Черновики</h3>
                  {drafts.map((d) => (
                    <div key={d.id} className={styles.draft}>
                      <div className={styles.draftText}>
                        <b>
                          {d.lines.map((l) => shortModelName(lineModelName(l, models)) || "Новая модель").join(", ") ||
                            "Пустой"}
                        </b>
                        <span>
                          {formatDay(d.date)}
                          {d.from && ` · ${d.from}`} · {d.lines.reduce((s, l) => s + lineQty(l), 0)} шт.
                        </span>
                      </div>
                      <Button variant="secondary" className={styles.onPanel} onClick={() => openDraft(d)}>
                        Продолжить
                      </Button>
                      <button type="button" className={styles.linkBtn} onClick={() => onDeleteDraft(d.id)}>
                        Удалить
                      </button>
                    </div>
                  ))}
                </section>
              )}

              <div className={styles.fields}>
                <Input
                  id="delivery-date"
                  label="Дата прихода"
                  type="date"
                  value={input.date}
                  onChange={(e) => update({ date: e.target.value, dateSet: true })}
                />
                <Input
                  id="delivery-from"
                  label="Откуда"
                  placeholder="Садовод"
                  list="delivery-suppliers"
                  value={input.from}
                  onChange={(e) => update({ from: e.target.value })}
                />
                <datalist id="delivery-suppliers">
                  {suppliers.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </div>

              <section className={styles.picker}>
                <h3>{input.lines.length === 0 ? "Какая модель пришла?" : "Добавить ещё модель"}</h3>
                <p className={styles.hint}>Каждая модель станет отдельной поставкой. Новая карточка появляется сверху.</p>
                <div className={styles.models}>
                  {pickable.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      className={styles.modelBtn}
                      onClick={() => update({ lines: [emptyLine(m), ...input.lines] })}
                    >
                      {m.name}
                    </button>
                  ))}
                  <button
                    type="button"
                    className={`${styles.modelBtn} ${styles.newModelBtn}`}
                    onClick={() => update({ lines: [emptyLine(), ...input.lines] })}
                  >
                    + Новая модель
                  </button>
                </div>
              </section>

              {input.lines.map((line) => (
                <DeliveryLineCard
                  key={line.key}
                  line={line}
                  models={models}
                  categories={categories}
                  onChange={(next) => update({ lines: input.lines.map((l) => (l.key === line.key ? next : l)) })}
                  onRemove={() => update({ lines: input.lines.filter((l) => l.key !== line.key) })}
                />
              ))}
            </div>
          ) : (
            <div className={styles.stepBody} key="review">
              <p className={styles.hint}>
                {formatDay(input.date)} · {input.from.trim()}. Будет добавлено на склад:
              </p>
              {input.lines.map((line) => {
                const name = lineModelName(line, models);
                const dup = findDuplicate(line, input.date, models);
                return (
                  <section key={line.key} className={styles.reviewCard}>
                    <div className={styles.reviewHead}>
                      <h3>{name}</h3>
                      {!line.productId && <StatusBadge tone="warning">Новая модель</StatusBadge>}
                    </div>
                    <p className={styles.reviewMeta}>
                      Поставка «{batchNameFor(line, input.date, models)}» · {formatRub(unitPrice(line))} за шт.
                    </p>
                    <div className={styles.reviewSizes}>
                      {line.sizes
                        .filter((s) => sizeQty(line, s) > 0)
                        .map((s) => (
                          <span key={s} className={styles.reviewSize}>
                            {s} <b>× {sizeQty(line, s)}</b>
                          </span>
                        ))}
                    </div>
                    {linePacks(line).some((p) => p.count > 0) && (
                      <p className={styles.reviewMeta}>
                        Из них пачки:{" "}
                        {linePacks(line)
                          .filter((p) => p.count > 0)
                          .map((p) => `«${p.name}» × ${p.count}`)
                          .join(", ")}
                      </p>
                    )}
                    <p className={styles.reviewTotal}>
                      <b>{lineQty(line)} шт.</b> на {formatRub(lineTotal(line))}
                    </p>
                    {dup && (
                      <div className={styles.dup}>
                        <StatusBadge tone={dup.sameQty ? "danger" : "warning"}>
                          {dup.sameQty ? "Похоже на дубль" : "Уже есть поставка"}
                        </StatusBadge>
                        <span>
                          «{dup.batch.name}» от {formatDay(dup.batch.date)}:{" "}
                          {dup.batch.delivered.reduce((s, d) => s + d.qty, 0)} шт.
                          {dup.sameQty ? " с теми же размерами. Точно не она?" : ". Это другая поставка?"}
                        </span>
                      </div>
                    )}
                  </section>
                );
              })}
              <p className={styles.grandTotal}>
                Итого <b>{totalQty} шт.</b> на <b>{formatRub(totalSum)}</b>
              </p>
            </div>
          )}
        </div>

        <footer className={styles.footer}>
          {confirmClose ? (
            <div className={styles.confirm}>
              <span>Закрыть без сохранения?</span>
              <div className={styles.actions}>
                <Button
                  variant="secondary"
                  onClick={() => {
                    onSaveDraft(input, draftId);
                    close();
                  }}
                >
                  Сохранить черновик
                </Button>
                <Button variant="secondary" onClick={close}>
                  Не сохранять
                </Button>
                <button type="button" className={styles.linkBtn} onClick={() => setConfirmClose(false)}>
                  Остаться
                </button>
              </div>
            </div>
          ) : step === "edit" ? (
            <>
              <span className={styles.status}>
                {draftNote ? "Черновик сохранён" : !ready && input.lines.length > 0 ? firstProblem : ""}
              </span>
              <div className={styles.actions}>
                <Button variant="secondary" onClick={saveDraft} disabled={!dirty || input.lines.length === 0}>
                  Сохранить черновик
                </Button>
                <Button onClick={() => setStep("review")} disabled={!ready}>
                  Продолжить
                </Button>
              </div>
            </>
          ) : (
            <>
              <span className={styles.status} />
              <div className={styles.actions}>
                <Button variant="secondary" onClick={() => setStep("edit")}>
                  Назад, исправить
                </Button>
                <Button onClick={submit} disabled={submitting}>
                  Добавить на склад
                </Button>
              </div>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}
