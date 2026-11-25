import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  chatUrl,
  formatDispatch,
  formatShipBy,
  PROBLEM_LABEL,
  resetOrderSize,
  SERVICE_LABEL,
  setOrderSize,
  STATUS_META,
  type Order,
} from "@/shared/orders";
import { categoryLabels, formatRub, formatSize, useStock, visibleSizes, type Model } from "@/shared/stock";
import { Button, Collapse, FilterChip, StatusBadge } from "@/shared/ui";
import { formatDateTime, formatOrderId, formatTime } from "../filter";
import styles from "./OrderRow.module.css";

type Props = {
  order: Order;
  /** Модель заказа со склада — её размеры для выбора. */
  model?: Model;
  /** Заказ в партии на пульте: размер не меняем, бирка уже в работе. */
  inBatch: boolean;
  open: boolean;
  onToggle: () => void;
};

export function OrderRow({ order, model, inBatch, open, onToggle }: Props) {
  const status = STATUS_META[order.status];
  const number = formatOrderId(order.id);
  const ref = useRef<HTMLLIElement>(null);
  const { sizeScale, categories } = useStock();
  const labels = categoryLabels(categories, model?.categoryId);

  // Открыли по ссылке «К заказу» — докручиваем до строки.
  useEffect(() => {
    if (open) ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [open]);

  return (
    <li className={styles.row} ref={ref}>
      <button type="button" className={styles.head} aria-expanded={open} onClick={onToggle}>
        <span className={styles.main}>
          <span className={styles.title}>
            {order.product}
            {order.size && <span className={styles.size}>{order.size}</span>}
          </span>
          <span className={styles.meta}>
            №&nbsp;{number} · {formatTime(order.createdAt)} · {SERVICE_LABEL[order.service]}
            {order.payout !== undefined && <> · {formatRub(order.payout)}</>}
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
            <Field label="Товар" value={order.problem === "noModel" ? "Не выбран" : order.product} />
            {order.itemTitle && <Field label="Объявление" value={order.itemTitle} />}
            <Field label="Размер" value={order.size ? formatSize(order.size, sizeScale, labels) : "Нет — выберите ниже"} />
            <Field label="Служба доставки" value={SERVICE_LABEL[order.service]} />
            {order.dispatchNumber && <Field label="Номер отправления" value={formatDispatch(order.dispatchNumber)} />}
            {order.shipBy && <Field label="Отгрузить до" value={formatShipBy(order.shipBy)} />}
            {order.payout !== undefined && <Field label="Вам" value={formatRub(order.payout)} />}
          </dl>
          <Money order={order} />
          {order.status === "ordered" && <SizeEditor order={order} model={model} inBatch={inBatch} />}
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

/** Размер руками, пока нет бота Гришки. Только у «Заказан» и не в партии на пульте. Клик выбирает, кнопка сохраняет. */
function SizeEditor({ order, model, inBatch }: { order: Order; model?: Model; inBatch: boolean }) {
  // Выбранный размер или «вернуть исходный» — ждёт подтверждения.
  const [picked, setPicked] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const original = order.manualSize?.original;
  let body;
  if (inBatch) body = <p className={styles.sizeNote}>Заказ в партии на пульте — верните партию в очередь, чтобы поменять размер</p>;
  else if (!model && order.itemId)
    body = (
      <p className={styles.sizeNote}>
        Объявление не привязано к товару склада —{" "}
        <Link className={styles.noteLink} to={`/listings?q=${order.itemId}`}>
          выбрать товар в «Объявлениях» →
        </Link>
      </p>
    );
  else if (!model) body = <p className={styles.sizeNote}>Модели «{order.product}» нет на складе</p>;
  else
    body = (
      <div className={styles.sizes}>
        {visibleSizes(model).map((s) => (
          <FilterChip
            key={s.size}
            label={s.size}
            count={s.stock.reduce((sum, b) => sum + b.qty, 0)}
            selected={(picked ?? order.size) === s.size}
            onClick={() => {
              setPicked(s.size === order.size ? null : s.size);
              setResetting(false);
            }}
          />
        ))}
      </div>
    );
  return (
    <div className={styles.sizeEditor}>
      <span className={styles.label}>{order.size ? "Поменять размер" : "Выбрать размер"} · рядом — сколько на полке</span>
      {body}
      {order.manualSize && !inBatch && !picked && !resetting && (
        <button type="button" className={styles.reset} onClick={() => setResetting(true)}>
          ↺ Вернуть исходный размер{original ? ` (${original})` : " (не было)"}
        </button>
      )}
      {resetting && (
        <div className={styles.confirm}>
          <Button
            onClick={() => {
              resetOrderSize(order.id);
              setResetting(false);
            }}
          >
            {original ? `Вернуть ${original}` : "Убрать размер"}
          </Button>
          <Button variant="secondary" onClick={() => setResetting(false)}>
            Отмена
          </Button>
        </div>
      )}
      {picked && (
        <div className={styles.confirm}>
          <Button
            onClick={() => {
              setOrderSize(order.id, picked, model);
              setPicked(null);
            }}
          >
            {order.size ? `Поменять ${order.size} на ${picked}` : `Поставить ${picked}`}
          </Button>
          <Button variant="secondary" onClick={() => setPicked(null)}>
            Отмена
          </Button>
        </div>
      )}
    </div>
  );
}

/** «Подробнее»: из чего сложилась сумма «вам» — как в карточке заказа Авито. */
function Money({ order }: { order: Order }) {
  const [open, setOpen] = useState(false);
  const { listPrice, price, payout } = order;
  if (price === undefined && listPrice === undefined) return null;
  const rows: [string, number][] = [];
  if (listPrice !== undefined) rows.push(["Цена объявления", listPrice]);
  if (listPrice !== undefined && price !== undefined && listPrice > price) rows.push(["Скидка Авито", price - listPrice]);
  if (price !== undefined) rows.push(["Продано за", price]);
  if (price !== undefined && payout !== undefined && price > payout) rows.push(["Удержал Авито (комиссия и прочее)", payout - price]);
  if (payout !== undefined) rows.push(["Вам", payout]);
  return (
    <div className={styles.money}>
      <button type="button" className={styles.reset} aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? "Скрыть подробнее ▴" : "Подробнее ▾"}
      </button>
      {open && (
        <dl className={styles.moneyRows}>
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt className={styles.label}>{label}</dt>
              <dd className={styles.value}>{formatRub(value)}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
