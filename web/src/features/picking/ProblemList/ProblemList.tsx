import { useState } from "react";
import { Link } from "react-router-dom";
import { chatUrl, formatOrderId, PROBLEM_LABEL, SERVICE_LABEL, setOrderSize, type Order } from "@/shared/orders";
import { orderModel, visibleSizes, type Model } from "@/shared/stock";
import { Button, Collapse, FilterChip, StatusBadge } from "@/shared/ui";
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
                  №&nbsp;{formatOrderId(o.id)} · {SERVICE_LABEL[o.service]} ·{" "}
                  <Link className={styles.chat} to={`/orders?order=${o.id}`}>
                    к заказу →
                  </Link>
                  {o.chatId && (
                    <>
                      {" · "}
                      <a className={styles.chat} href={chatUrl(o.chatId)} target="_blank" rel="noreferrer">
                        чат ↗
                      </a>
                    </>
                  )}
                </span>
                <span className={styles.hint}>
                  → {problemHint(o, models)}
                  {o.problem === "noModel" && o.itemId && (
                    <>
                      {" "}
                      <Link className={styles.chat} to={`/listings?q=${o.itemId}`}>
                        выбрать товар →
                      </Link>
                    </>
                  )}
                </span>
                {o.problem === "noSize" && <SizePicker order={o} models={models} />}
              </div>
              {o.problem && <StatusBadge tone="danger">⚠ {PROBLEM_LABEL[o.problem]}</StatusBadge>}
            </li>
          ))}
        </ul>
      </Collapse>
    </section>
  );
}

/** Размер руками, пока нет бота Гришки: размеры модели со склада, рядом — сколько на полке. Клик выбирает, кнопка сохраняет. */
function SizePicker({ order, models }: { order: Order; models: Model[] }) {
  const [picked, setPicked] = useState<string | null>(null);
  const model = orderModel(order, models);
  if (!model) return null;
  return (
    <>
      <div className={styles.sizes}>
        {visibleSizes(model).map((s) => (
          <FilterChip
            key={s.size}
            label={s.size}
            count={s.stock.reduce((sum, b) => sum + b.qty, 0)}
            selected={picked === s.size}
            onClick={() => setPicked(picked === s.size ? null : s.size)}
          />
        ))}
      </div>
      {picked && (
        <div className={styles.sizes}>
          <Button onClick={() => setOrderSize(order.id, picked, model)}>Поставить {picked}</Button>
          <Button variant="secondary" onClick={() => setPicked(null)}>
            Отмена
          </Button>
        </div>
      )}
    </>
  );
}
