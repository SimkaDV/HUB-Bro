import { formatOrderId, PROBLEM_LABEL, type Order } from "@/shared/orders";
import type { Model } from "@/shared/stock";
import { Collapse, StatusBadge } from "@/shared/ui";
import { problemHint } from "../problems";
import styles from "./ProblemList.module.css";

type Props = {
  orders: Order[];
  models: Model[];
  open: boolean;
  onToggle: () => void;
};

/** «Показать проблемы»: заказы, которые не попадают в очередь, и что с ними сделать. */
export function ProblemList({ orders, models, open, onToggle }: Props) {
  if (orders.length === 0) return null;

  return (
    <section className={styles.card} id="problems">
      <button type="button" className={styles.head} aria-expanded={open} onClick={onToggle}>
        <span>
          ⚠ {open ? "Скрыть проблемы" : "Показать проблемы"} <span className={styles.count}>{orders.length}</span>
        </span>
        <span className={`${styles.chevron} ${open ? styles.up : ""}`} aria-hidden>
          ▾
        </span>
      </button>
      <Collapse open={open}>
        <ul className={styles.list}>
          {orders.map((o) => (
            <li key={o.id} className={styles.row}>
              <div className={styles.main}>
                <span className={styles.title}>
                  {o.product}
                  {o.size && <span className={styles.size}>{o.size}</span>}
                </span>
                <span className={styles.meta}>
                  №&nbsp;{formatOrderId(o.id)} · {o.pickupPoint}
                </span>
                <span className={styles.hint}>→ {problemHint(o, models)}</span>
              </div>
              {o.problem && <StatusBadge tone="danger">⚠ {PROBLEM_LABEL[o.problem]}</StatusBadge>}
            </li>
          ))}
        </ul>
      </Collapse>
    </section>
  );
}
