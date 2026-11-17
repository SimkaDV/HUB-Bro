import { DEFAULT_SERVICE_ORDER, setServiceOrder } from "@/shared/fulfillment";
import { SERVICE_LABEL, type DeliveryService } from "@/shared/orders";
import { compareSizes } from "@/shared/stock";
import { FilterChip } from "@/shared/ui";
import { countBy, type QueueConfig, type QueueItem } from "../queue";
import styles from "./QueueSettings.module.css";

type Props = {
  config: QueueConfig;
  onChange: (c: QueueConfig) => void;
  /** Вся очередь без фильтров — для счётчиков на чипах. */
  items: QueueItem[];
  /** Порядок моделей и размеров — как на складе. */
  modelOrder: string[];
  sizeOrder: (model: string) => string[];
  /** Порядок служб — общий, меняется здесь же. */
  serviceOrder: DeliveryService[];
};

const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

/** Порядок печати (постоянный, меняется только порядок служб) и фильтры очереди. */
export function QueueSettings({ config, onChange, items, modelOrder, sizeOrder, serviceOrder }: Props) {
  const move = (index: number, delta: number) => {
    const next = [...serviceOrder];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    setServiceOrder(next);
  };
  const isDefault = serviceOrder.join() === DEFAULT_SERVICE_ORDER.join();

  const byModel = countBy(items, (i) => i.order.product);
  const models = modelOrder.filter((m) => byModel.has(m));
  // Размеры показываем у выбранных моделей, а если не выбрано ни одной — у всех, что есть в очереди.
  const scope = config.models.length ? items.filter((i) => config.models.includes(i.order.product)) : items;
  const bySize = countBy(scope, (i) => i.order.size ?? "");
  const scopeModels = config.models.length ? config.models : models;
  const sizes = [...new Set(scopeModels.flatMap(sizeOrder))].filter((s) => bySize.has(s));
  // У одной модели — её порядок размеров, у нескольких — общий: 30S, 30M, 31S…
  if (scopeModels.length > 1) sizes.sort(compareSizes);
  const byService = countBy(items, (i) => i.order.service);

  return (
    <div className={styles.panel}>
      <div className={styles.block}>
        <span className={styles.caption}>Порядок печати</span>
        <p className={styles.order}>
          Категория → Товар → Размер → Служба. Внутри — срочные сверху: по сроку отгрузки, без срока в конце.
        </p>
        <div className={styles.servicesHead}>
          <span className={styles.caption}>Порядок служб</span>
          {!isDefault && (
            <button type="button" className={styles.reset} onClick={() => setServiceOrder(DEFAULT_SERVICE_ORDER)}>
              По умолчанию
            </button>
          )}
        </div>
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
      </div>

      <div className={styles.block}>
        <span className={styles.caption}>Что печатать</span>
        <div className={styles.chips} role="group" aria-label="Модели">
          <FilterChip label="Все модели" selected={config.models.length === 0} onClick={() => onChange({ ...config, models: [], sizes: [] })} />
          {models.map((m) => (
            <FilterChip
              key={m}
              label={m}
              count={byModel.get(m)}
              selected={config.models.includes(m)}
              onClick={() => onChange({ ...config, models: toggle(config.models, m), sizes: [] })}
            />
          ))}
        </div>
        {sizes.length > 1 && (
          <div className={styles.chips} role="group" aria-label="Размеры">
            <FilterChip label="Все размеры" selected={config.sizes.length === 0} onClick={() => onChange({ ...config, sizes: [] })} />
            {sizes.map((s) => (
              <FilterChip
                key={s}
                label={s}
                count={bySize.get(s)}
                selected={config.sizes.includes(s)}
                onClick={() => onChange({ ...config, sizes: toggle(config.sizes, s) })}
              />
            ))}
          </div>
        )}
        <div className={styles.chips} role="group" aria-label="Службы доставки">
          <FilterChip label="Все службы" selected={config.services.length === 0} onClick={() => onChange({ ...config, services: [] })} />
          {serviceOrder.map((s) => (
            <FilterChip
              key={s}
              label={SERVICE_LABEL[s]}
              count={byService.get(s) ?? 0}
              selected={config.services.includes(s)}
              onClick={() => onChange({ ...config, services: toggle<DeliveryService>(config.services, s) })}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
