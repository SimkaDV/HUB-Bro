import { chatUrl, formatDispatch, formatShipBy, PROBLEM_LABEL, SERVICE_LABEL, STATUS_META, type Order } from "@/shared/orders";
import { Collapse, StatusBadge } from "@/shared/ui";
import { formatDateTime, formatOrderId, formatTime } from "../filter";
import styles from "./OrderRow.module.css";

type Props = {
  order: Order;
  open: boolean;
  onToggle: () => void;
};

export function OrderRow({ order, open, onToggle }: Props) {
  const status = STATUS_META[order.status];
  const number = formatOrderId(order.id);

  return (
    <li className={styles.row}>
      <button type="button" className={styles.head} aria-expanded={open} onClick={onToggle}>
        <span className={styles.main}>
          <span className={styles.title}>
            {order.product}
            {order.size && <span className={styles.size}>{order.size}</span>}
          </span>
          <span className={styles.meta}>
            №&nbsp;{number} · {formatTime(order.createdAt)} · {SERVICE_LABEL[order.service]}
          </span>
        </span>
        <span className={styles.badges}>
          <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
          {order.problem && <StatusBadge tone="danger">⚠ {PROBLEM_LABEL[order.problem]}</StatusBadge>}
          {order.disputed && <StatusBadge tone="danger">Спорный</StatusBadge>}
        </span>
      </button>

      <Collapse open={open} className={styles.details}>
        <div>
          <dl className={styles.fields}>
            <Field label="Номер Авито" value={number} />
            <Field label="Заказан" value={formatDateTime(order.createdAt)} />
            <Field label="Товар" value={order.product} />
            <Field label="Размер" value={order.size ?? "Нет — укажите в комплектации"} />
            <Field label="Служба доставки" value={SERVICE_LABEL[order.service]} />
            {order.dispatchNumber && <Field label="Номер отправления" value={formatDispatch(order.dispatchNumber)} />}
            {order.shipBy && <Field label="Отгрузить до" value={formatShipBy(order.shipBy)} />}
          </dl>
          {order.chatId && (
            <a className={styles.chat} href={chatUrl(order.chatId)} target="_blank" rel="noreferrer">
              Чат с покупателем ↗
            </a>
          )}
        </div>

        <div>
          <h3 className={styles.historyTitle}>История</h3>
          <ol className={styles.history}>
            {order.history.map((h, i) => (
              <li key={i} className={i === order.history.length - 1 ? styles.current : undefined}>
                <span className={styles.step}>{STATUS_META[h.status].label}</span>
                <span className={styles.when}>{formatDateTime(h.at)}</span>
              </li>
            ))}
          </ol>
        </div>
      </Collapse>
    </li>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className={styles.label}>{label}</dt>
      <dd className={styles.value}>{value}</dd>
    </div>
  );
}
