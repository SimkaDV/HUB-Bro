import { SizeChip } from "../SizeChip/SizeChip";
import { SizeRow } from "../SizeRow/SizeRow";
import { compareSizes, sizesByAttention } from "../stock";
import type { Model } from "../types";
import styles from "./ModelDetail.module.css";

type Props = {
  model: Model;
  /** Панель затухает перед сменой модели. */
  leaving?: boolean;
  onClose: () => void;
};

export function ModelDetail({ model, leaving, onClose }: Props) {
  const sizes = [...model.sizes].sort((a, b) => compareSizes(a.size, b.size));

  return (
    <section className={`${styles.detail} ${leaving ? styles.leaving : ""}`} aria-label={model.name}>
      <div className={styles.head}>
        <h2 className={styles.name}>{model.name}</h2>
        <div className={styles.chips}>
          {sizesByAttention(model).map((s) => (
            <SizeChip key={s.size} {...s} />
          ))}
        </div>
        <button type="button" className={styles.close} onClick={onClose}>
          Свернуть
        </button>
      </div>
      <div className={styles.sizes}>
        {sizes.map((s) => (
          <SizeRow key={`${model.id}:${s.size}`} model={model} sizeStock={s} />
        ))}
      </div>
    </section>
  );
}
