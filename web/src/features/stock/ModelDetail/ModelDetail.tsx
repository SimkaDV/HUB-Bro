import { SizeChip } from "../SizeChip/SizeChip";
import { SizeRow } from "../SizeRow/SizeRow";
import { useStockSettings } from "../settings";
import { sizesByAttention, visibleSizes } from "@/shared/stock";
import type { Model } from "@/shared/stock";
import styles from "./ModelDetail.module.css";

type Props = {
  model: Model;
  /** Панель затухает перед сменой модели. */
  leaving?: boolean;
  /** Размер, к которому надо перейти; nonce меняется на каждый клик, даже по тому же размеру. */
  focus?: { size: string; nonce: number };
  onSizeClick: (size: string) => void;
  onClose: () => void;
};

export function ModelDetail({ model, leaving, focus, onSizeClick, onClose }: Props) {
  const { thresholdsFor } = useStockSettings();
  // Порядок размеров — как настроен у модели; скрытые не показываем.
  const sizes = visibleSizes(model);

  return (
    <section className={`${styles.detail} ${leaving ? styles.leaving : ""}`} aria-label={model.name}>
      <div className={styles.head}>
        <h2 className={styles.name}>{model.name}</h2>
        <div className={styles.chips}>
          {sizesByAttention(model, thresholdsFor(model)).map((s) => (
            <SizeChip key={s.size} {...s} onClick={() => onSizeClick(s.size)} />
          ))}
        </div>
        <button type="button" className={styles.close} onClick={onClose}>
          Свернуть
        </button>
      </div>
      <div className={styles.sizes}>
        {sizes.map((s) => (
          <SizeRow
            key={`${model.id}:${s.size}`}
            model={model}
            sizeStock={s}
            focusNonce={focus?.size === s.size ? focus.nonce : undefined}
          />
        ))}
      </div>
    </section>
  );
}
