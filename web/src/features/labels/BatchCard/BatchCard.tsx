import { useState } from "react";
import {
  BATCH_STATE,
  batchState,
  cancelBatch,
  formatTime,
  ISSUE_LABEL,
  ISSUE_REASONS,
  markPrinted,
  markStuck,
  type BatchIssue,
  type IssueReason,
  type PrintBatch,
} from "@/shared/fulfillment";
import { formatOrderId, SERVICE_LABEL, STATUS_META, type Order } from "@/shared/orders";
import { Button, Collapse, StatusBadge } from "@/shared/ui";
import styles from "./BatchCard.module.css";

type Props = {
  batch: PrintBatch;
  orders: Map<string, Order>;
};

type Draft = Record<string, { reason: IssueReason | ""; comment: string }>;

const countLine = (counts: Map<string, number>) => [...counts].map(([k, n]) => `${k} ×${n}`).join(" · ");

/** Партия на пульте: состав, печать, «Партия расклеена» с ошибками, итог. */
export function BatchCard({ batch, orders }: Props) {
  const state = batchState(batch);
  const meta = BATCH_STATE[state];
  const [showOrders, setShowOrders] = useState(false);
  const [sticking, setSticking] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [draft, setDraft] = useState<Draft>({});

  const items = batch.orderIds.map((id) => ({ id, order: orders.get(id) }));
  const byItem = new Map<string, number>();
  const byService = new Map<string, number>();
  for (const { order } of items) {
    if (!order) continue;
    const key = `${order.product} ${order.size ?? ""}`.trim();
    byItem.set(key, (byItem.get(key) ?? 0) + 1);
    byService.set(SERVICE_LABEL[order.service], (byService.get(SERVICE_LABEL[order.service]) ?? 0) + 1);
  }

  const issues: BatchIssue[] = Object.entries(draft)
    .filter(([, d]) => d.reason)
    .map(([orderId, d]) => ({ orderId, reason: d.reason as IssueReason, comment: d.comment.trim() || undefined }));
  const failed = new Set((state === "stuck" ? batch.issues : issues).map((i) => i.orderId));
  // «Собран» получат только заказы, которые всё ещё «Заказан» и без ошибки (отменённые Авито — нет).
  const willPack = items.filter(({ id, order }) => order?.status === "ordered" && !failed.has(id)).length;
  const issueFor = (id: string) => batch.issues.find((i) => i.orderId === id);

  const setReason = (id: string, reason: IssueReason | "") =>
    setDraft((d) => ({ ...d, [id]: { comment: d[id]?.comment ?? "", reason } }));
  const setComment = (id: string, comment: string) =>
    setDraft((d) => ({ ...d, [id]: { reason: d[id]?.reason ?? "other", comment } }));

  return (
    <article className={`${styles.card} ${state === "stuck" || state === "cancelled" ? styles.done : ""}`}>
      <header className={styles.head}>
        <span className={styles.number}>Партия №{batch.number}</span>
        <span className={styles.meta}>
          {formatTime(batch.createdAt)} · {batch.orderIds.length} шт.
        </span>
        <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
      </header>

      <p className={styles.note}>{batch.note}</p>
      <p className={styles.line}>{countLine(byItem)}</p>
      <p className={styles.lineSecondary}>{countLine(byService)}</p>

      {state === "stuck" && (
        <p className={styles.result}>
          Расклеена в {formatTime(batch.stuckAt!)} · собрано {batch.orderIds.length - batch.issues.length}
          {batch.issues.length > 0 && ` · вернули в очередь ${batch.issues.length}`}
        </p>
      )}
      {state === "cancelled" && <p className={styles.result}>Вернули в очередь в {formatTime(batch.cancelledAt!)}</p>}

      {!sticking && (
        <button type="button" className={styles.toggle} aria-expanded={showOrders} onClick={() => setShowOrders(!showOrders)}>
          {showOrders ? "Скрыть заказы" : "Показать заказы"} ▾
        </button>
      )}

      <Collapse open={showOrders || sticking}>
        <ol className={styles.orders}>
          {items.map(({ id, order }) => {
            const done = issueFor(id);
            const notOurs = order && order.status !== "ordered" && order.status !== "packed";
            return (
              <li key={id} className={failed.has(id) ? styles.failed : ""}>
                <div className={styles.orderRow}>
                  <span className={styles.size}>{order?.size ?? "?"}</span>
                  <span className={styles.orderMain}>
                    <span>{order?.product ?? "Заказ не найден"}</span>
                    <span className={styles.lineSecondary}>
                      №&nbsp;{formatOrderId(id)}
                      {order && ` · ${order.pickupPoint}`}
                    </span>
                  </span>
                  {notOurs && <StatusBadge tone="neutral">{STATUS_META[order.status].label}</StatusBadge>}
                  {done && <StatusBadge tone="danger">⚠ {ISSUE_LABEL[done.reason]}</StatusBadge>}
                </div>
                {done?.comment && <p className={styles.comment}>{done.comment}</p>}
                {sticking && (
                  <div className={styles.issue}>
                    <select
                      aria-label={`Ошибка по заказу ${id}`}
                      value={draft[id]?.reason ?? ""}
                      onChange={(e) => setReason(id, e.target.value as IssueReason | "")}
                    >
                      <option value="">Расклеена</option>
                      {ISSUE_REASONS.map((r) => (
                        <option key={r.id} value={r.id}>
                          ⚠ {r.label}
                        </option>
                      ))}
                    </select>
                    {draft[id]?.reason && (
                      <input
                        type="text"
                        placeholder="Комментарий"
                        value={draft[id]?.comment ?? ""}
                        onChange={(e) => setComment(id, e.target.value)}
                      />
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </Collapse>

      {state === "queued" && !confirmCancel && (
        <div className={styles.actions}>
          <Button onClick={() => markPrinted(batch.id)}>Напечатать</Button>
          <Button variant="secondary" onClick={() => setConfirmCancel(true)}>
            Вернуть в очередь
          </Button>
        </div>
      )}
      {confirmCancel && (
        <div className={styles.actions}>
          <span>Вернуть {batch.orderIds.length} шт. в очередь комплектации?</span>
          <Button onClick={() => cancelBatch(batch.id)}>Да, вернуть</Button>
          <Button variant="secondary" onClick={() => setConfirmCancel(false)}>
            Нет
          </Button>
        </div>
      )}
      {state === "printed" && !sticking && (
        <div className={styles.actions}>
          <Button onClick={() => setSticking(true)}>Партия расклеена</Button>
        </div>
      )}
      {sticking && (
        <div className={styles.actions}>
          <span className={styles.hint}>Отметь бирки с ошибкой — эти заказы вернутся в очередь</span>
          <Button onClick={() => markStuck(batch.id, issues)}>
            Подтвердить: собрано {willPack}
            {issues.length > 0 && `, в очередь ${issues.length}`}
          </Button>
          <Button variant="secondary" onClick={() => setSticking(false)}>
            Отмена
          </Button>
        </div>
      )}
    </article>
  );
}
