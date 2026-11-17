import {
  DEFAULT_SERVICE_ORDER,
  QueueFilter,
  setServiceOrder,
  type QueueItem,
  type QueueSelection,
} from "@/shared/fulfillment";
import { SERVICE_LABEL, type DeliveryService } from "@/shared/orders";
import { useState } from "react";
import { Collapse } from "@/shared/ui";
import styles from "./QueueSettings.module.css";

type Props = {
  selection: QueueSelection;
  onChange: (s: QueueSelection) => void;
  /** Вся очередь без фильтров — для счётчиков на чипах. */
  items: QueueItem[];
  /** Порядок моделей и размеров — как на складе. */
  modelOrder: string[];
  sizeOrder: (model: string) => string[];
  /** Порядок служб — общий, меняется здесь же. */
  serviceOrder: DeliveryService[];
};

/** Порядок печати (постоянный, меняется только порядок служб) и выбор «Что печатать». */
export function QueueSettings({ selection, onChange, items, modelOrder, sizeOrder, serviceOrder }: Props) {
  const [servicesOpen, setServicesOpen] = useState(false);
  const move = (index: number, delta: number) => {
    const next = [...serviceOrder];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    setServiceOrder(next);
  };
  const isDefault = serviceOrder.join() === DEFAULT_SERVICE_ORDER.join();

  return (
    <div className={styles.panel}>
      <div className={styles.block}>
        <span className={styles.caption}>Порядок печати</span>
        <p className={styles.order}>
          Категория → Товар → Размер → Служба. Внутри — срочные сверху: по сроку отгрузки, без срока в конце.
        </p>
        <button
          type="button"
          className={styles.servicesToggle}
          aria-expanded={servicesOpen}
          onClick={() => setServicesOpen(!servicesOpen)}
        >
          <span className={styles.servicesSummary}>
            <span className={styles.caption}>Порядок служб</span>
            <span>{serviceOrder.map((s) => SERVICE_LABEL[s]).join(" → ")}</span>
          </span>
          <span className={`${styles.chevron} ${servicesOpen ? styles.chevronOpen : ""}`} aria-hidden>
            ▾
          </span>
        </button>
        <Collapse open={servicesOpen} className={styles.servicesBody}>
          <ol className={styles.levels}>
            {serviceOrder.map((s, i) => (
              <li key={s} className={styles.level}>
                <span className={styles.levelName}>
                  <span className={styles.num}>{i + 1}</span>
                  {SERVICE_LABEL[s]}
                </span>
                <span className={styles.arrows}>
                  <button type="button" aria-label={`${SERVICE_LABEL[s]} выше`} disabled={i === 0} onClick={() => move(i, -1)}>
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={`${SERVICE_LABEL[s]} ниже`}
                    disabled={i === serviceOrder.length - 1}
                    onClick={() => move(i, 1)}
                  >
                    ↓
                  </button>
                </span>
              </li>
            ))}
          </ol>
          {!isDefault && (
            <button type="button" className={styles.reset} onClick={() => setServiceOrder(DEFAULT_SERVICE_ORDER)}>
              По умолчанию
            </button>
          )}
        </Collapse>
      </div>

      <div className={styles.block}>
        <span className={styles.caption}>Что печатать</span>
        <QueueFilter
          selection={selection}
          onChange={onChange}
          items={items}
          modelOrder={modelOrder}
          sizeOrder={sizeOrder}
          serviceOrder={serviceOrder}
        />
      </div>
    </div>
  );
}
