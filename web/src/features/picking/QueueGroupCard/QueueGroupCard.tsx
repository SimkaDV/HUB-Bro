import { useEffect, useRef } from "react";
import { formatOrderId, SERVICE_LABEL } from "@/shared/orders";
import { formatTime, isToday } from "@/shared/fulfillment";
import { isOverdue, type QueueGroup } from "@/shared/fulfillment";
import styles from "./QueueGroupCard.module.css";

type Props = {
  group: QueueGroup;
  selected: Set<string>;
  onSelect: (ids: string[], on: boolean) => void;
  onSend: (ids: string[]) => void;
};

const when = (iso: string) =>
  isToday(iso) ? formatTime(iso) : `${new Date(iso).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })}, ${formatTime(iso)}`;

/** «2026-11-18» → «18.11». */
const shipDay = (date: string) => date.slice(8, 10) + "." + date.slice(5, 7);

/** Группа очереди: заголовок с галочкой и «В партию», строки заказов. */
export function QueueGroupCard({ group, selected, onSelect, onSend }: Props) {
  const ids = group.items.map((i) => i.order.id);
  const picked = ids.filter((id) => selected.has(id)).length;
  const all = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (all.current) all.current.indeterminate = picked > 0 && picked < ids.length;
  }, [picked, ids.length]);

  return (
    <section className={styles.card}>
      <header className={styles.head}>
        <label className={styles.title}>
          <input ref={all} type="checkbox" checked={picked === ids.length} onChange={(e) => onSelect(ids, e.target.checked)} />
          {group.title}
          <span className={styles.count}>{ids.length}</span>
        </label>
        <button type="button" className={styles.send} onClick={() => onSend(ids)}>
          В партию →
        </button>
      </header>
      <ul className={styles.list}>
        {group.items.map(({ order: o }) => (
          <li key={o.id}>
            <label className={styles.row}>
              <input type="checkbox" checked={selected.has(o.id)} onChange={(e) => onSelect([o.id], e.target.checked)} />
              <span className={styles.size}>{o.size}</span>
              <span className={styles.main}>
                <span className={styles.product}>{o.product}</span>
                <span className={styles.meta}>
                  №&nbsp;{formatOrderId(o.id)} · {when(o.createdAt)} · {SERVICE_LABEL[o.service]}
                  {o.shipBy && (
                    <>
                      {" · "}
                      <span className={isOverdue(o.shipBy) ? styles.overdue : undefined}>
                        {isOverdue(o.shipBy) ? "просрочен, " : ""}до {shipDay(o.shipBy)}
                      </span>
                    </>
                  )}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}
