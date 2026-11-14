import { SERVICES, type DeliveryService } from "@/shared/orders";
import { compareSizes } from "@/shared/stock";
import { FilterChip } from "@/shared/ui";
import { countBy, PRESETS, SORT_LABEL, type QueueConfig, type QueueItem } from "../queue";
import styles from "./QueueSettings.module.css";

type Props = {
  config: QueueConfig;
  onChange: (c: QueueConfig) => void;
  /** Вся очередь без фильтров — для счётчиков на чипах. */
  items: QueueItem[];
  /** Порядок моделей и размеров — как на складе. */
  modelOrder: string[];
  sizeOrder: (model: string) => string[];
};

const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

/** Порядок печати (уровни сортировки) и фильтры очереди. */
export function QueueSettings({ config, onChange, items, modelOrder, sizeOrder }: Props) {
  const move = (index: number, delta: number) => {
    const levels = [...config.levels];
    [levels[index], levels[index + delta]] = [levels[index + delta], levels[index]];
    onChange({ ...config, levels });
  };
  const activePreset = PRESETS.find((p) => JSON.stringify(p.levels) === JSON.stringify(config.levels))?.id;

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
        <div className={styles.chips}>
          {PRESETS.map((p) => (
            <FilterChip
              key={p.id}
              label={p.label}
              selected={activePreset === p.id}
              onClick={() => onChange({ ...config, levels: p.levels })}
            />
          ))}
        </div>
        <ol className={styles.levels}>
          {config.levels.map((l, i) => (
            <li key={l.key} className={`${styles.level} ${l.on ? "" : styles.off}`}>
              <label className={styles.levelName}>
                <input
                  type="checkbox"
                  checked={l.on}
                  onChange={() =>
                    onChange({ ...config, levels: config.levels.map((x) => (x.key === l.key ? { ...x, on: !x.on } : x)) })
                  }
                />
                {SORT_LABEL[l.key]}
              </label>
              <span className={styles.arrows}>
                <button type="button" aria-label={`${SORT_LABEL[l.key]} выше`} disabled={i === 0} onClick={() => move(i, -1)}>
                  ↑
                </button>
                <button
                  type="button"
                  aria-label={`${SORT_LABEL[l.key]} ниже`}
                  disabled={i === config.levels.length - 1}
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
          {SERVICES.map((s) => (
            <FilterChip
              key={s.id}
              label={s.label}
              count={byService.get(s.id) ?? 0}
              selected={config.services.includes(s.id)}
              onClick={() => onChange({ ...config, services: toggle<DeliveryService>(config.services, s.id) })}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
