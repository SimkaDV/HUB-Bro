import { useState } from "react";
import { SERVICE_LABEL, type DeliveryService } from "@/shared/orders";
import { Collapse, FilterChip } from "@/shared/ui";
import {
  ALL_SELECTED,
  countBy,
  isAllSelected,
  isProductSelected,
  isServiceSelected,
  isSizeSelected,
  toggleProduct,
  toggleService,
  toggleSize,
  type QueueItem,
  type QueueSelection,
  type SelectionOptions,
} from "../queue";
import styles from "./QueueFilter.module.css";

type Props = {
  selection: QueueSelection;
  onChange: (s: QueueSelection) => void;
  /** Вся очередь без выбора — для счётчиков на чипах. */
  items: QueueItem[];
  /** Порядок моделей и размеров — как на складе. */
  modelOrder: string[];
  sizeOrder: (model: string) => string[];
  serviceOrder: DeliveryService[];
};

/**
 * Что печатать: «Все» / по товару (и размерам товара) / по службе. Один и тот же на комплектации и пульте.
 * Описание — docs/PICKING.md, раздел 6, «Выбор».
 */
export function QueueFilter({ selection, onChange, items, modelOrder, sizeOrder, serviceOrder }: Props) {
  const [sizesOpen, setSizesOpen] = useState(false);

  const byModel = countBy(items, (i) => i.order.product);
  const bySize = countBy(items, (i) => `${i.order.product}|${i.order.size ?? ""}`);
  const byService = countBy(items, (i) => i.order.service);
  const products = modelOrder.filter((m) => byModel.has(m));
  const sizesOf = (m: string) => sizeOrder(m).filter((s) => bySize.has(`${m}|${s}`));
  const options: SelectionOptions = { products, sizes: sizesOf, services: serviceOrder };

  // Размеры выбираются у отмеченных товаров, где размеров больше одного.
  const sizeRows = products.filter((m) => isProductSelected(selection, m) && sizesOf(m).length > 1);
  const narrowed = sizeRows.filter((m) => selection.products?.[m]);
  const sizesSummary = narrowed.length
    ? narrowed.map((m) => `${m}: ${selection.products?.[m]?.join(", ")}`).join(" · ")
    : "все";

  return (
    <div className={styles.filter}>
      <div className={styles.chips}>
        <FilterChip label="Все" count={items.length} selected={isAllSelected(selection)} onClick={() => onChange(ALL_SELECTED)} />
      </div>

      <div className={styles.row}>
        <span className={styles.caption}>Товар</span>
        <div className={styles.chips} role="group" aria-label="Товары">
          {products.map((m) => (
            <FilterChip
              key={m}
              label={m}
              count={byModel.get(m)}
              selected={isProductSelected(selection, m)}
              onClick={() => onChange(toggleProduct(selection, m, options))}
            />
          ))}
          {products.length === 0 && <span className={styles.none}>очередь пуста</span>}
        </div>
      </div>

      {sizeRows.length > 0 && (
        <div className={styles.row}>
          <button type="button" className={styles.sizesToggle} aria-expanded={sizesOpen} onClick={() => setSizesOpen(!sizesOpen)}>
            <span className={styles.caption}>Размеры</span>
            <span className={styles.sizesSummary}>{sizesSummary}</span>
            <span className={`${styles.chevron} ${sizesOpen ? styles.chevronOpen : ""}`} aria-hidden>
              ▾
            </span>
          </button>
          <Collapse open={sizesOpen} className={styles.sizes}>
            {sizeRows.map((m) => (
              <div key={m} className={styles.sizeRow}>
                <span className={styles.sizeModel}>{m}</span>
                <div className={styles.chips} role="group" aria-label={`Размеры: ${m}`}>
                  {sizesOf(m).map((s) => (
                    <FilterChip
                      key={s}
                      label={s}
                      count={bySize.get(`${m}|${s}`)}
                      selected={isSizeSelected(selection, m, s)}
                      onClick={() => onChange(toggleSize(selection, m, s, options))}
                    />
                  ))}
                </div>
              </div>
            ))}
          </Collapse>
        </div>
      )}

      <div className={styles.row}>
        <span className={styles.caption}>Служба</span>
        <div className={styles.chips} role="group" aria-label="Службы доставки">
          {serviceOrder.map((s) => (
            <FilterChip
              key={s}
              label={SERVICE_LABEL[s]}
              count={byService.get(s) ?? 0}
              selected={isServiceSelected(selection, s)}
              onClick={() => onChange(toggleService(selection, s, options))}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
