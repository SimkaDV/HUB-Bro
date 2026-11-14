import { useEffect, useRef, useState } from "react";
import { Collapse } from "@/shared/ui";
import { ModelDetail } from "../ModelDetail/ModelDetail";
import { ModelTile } from "../ModelTile/ModelTile";
import { useStockSettings } from "../settings";
import { modelsByAttention } from "@/shared/stock";
import type { Model } from "@/shared/stock";
import styles from "./StockOverview.module.css";

// Совпадает с длительностью затухания .leaving в ModelDetail.module.css.
const SWITCH_FADE_MS = 180;
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

type Props = {
  models: Model[];
};

/** Остатки: бенто-сетка моделей и раскрытая модель под ней. */
export function StockOverview({ models: source }: Props) {
  const { thresholdsFor } = useStockSettings();
  const models = modelsByAttention(source, thresholdsFor);
  const [selectedId, setSelectedId] = useState<string | null>(models[0]?.id ?? null);
  // Последняя открытая модель: остаётся на экране, пока панель плавно сворачивается.
  const [shownId, setShownId] = useState(selectedId);
  const [leaving, setLeaving] = useState(false);
  const switchTimer = useRef<number>();
  const shown = models.find((m) => m.id === shownId);
  // Модель могла пропасть (например, отменили её единственную поставку).
  const isOpen = models.some((m) => m.id === selectedId);

  const select = (id: string | null) => {
    window.clearTimeout(switchTimer.current);
    setSelectedId(id);
    setFocus(null);
    if (!id) return;
    if (!isOpen || reducedMotion()) {
      setLeaving(false);
      setShownId(id);
      return;
    }
    // Смена модели: старая панель затухает, потом проявляется новая.
    setLeaving(true);
    switchTimer.current = window.setTimeout(() => {
      setShownId(id);
      setLeaving(false);
    }, SWITCH_FADE_MS);
  };

  useEffect(() => () => window.clearTimeout(switchTimer.current), []);

  // Клик по чипу размера: открыть модель (если не открыта) и сразу этот размер.
  const [focus, setFocus] = useState<{ modelId: string; size: string; nonce: number } | null>(null);
  const openSize = (modelId: string, size: string) => {
    if (modelId !== selectedId) select(modelId);
    setFocus({ modelId, size, nonce: Date.now() });
  };

  // «+N» на плитке: открыть модель и плавно прокрутить к её списку размеров.
  const detailRef = useRef<HTMLDivElement>(null);
  const expand = (modelId: string) => {
    if (modelId !== selectedId) select(modelId);
    window.setTimeout(
      () => detailRef.current?.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "start" }),
      modelId === selectedId ? 0 : SWITCH_FADE_MS + 50,
    );
  };

  return (
    <>
      <div className={styles.legend}>
        <span><b className={styles.low}>3</b> мало</span>
        <span><b className={styles.mid}>8</b> норм</span>
        <span><b className={styles.ok}>20</b> много</span>
        <span><b className={styles.zero}>0</b> нет</span>
        <span><b>+1</b> возврат едет к нам</span>
        <span>Пороги — у категории или модели в настройках</span>
      </div>

      <div className={styles.grid}>
        {models.map((m) => (
          <ModelTile
            key={m.id}
            model={m}
            selected={m.id === selectedId}
            onSelect={() => select(m.id === selectedId ? null : m.id)}
            onExpand={() => expand(m.id)}
            onSizeClick={(size) => openSize(m.id, size)}
          />
        ))}
      </div>

      <div ref={detailRef} className={styles.detailAnchor} />
      <Collapse open={isOpen}>
        {shown && (
          <ModelDetail
            key={shown.id}
            model={shown}
            leaving={leaving}
            focus={focus?.modelId === shown.id ? focus : undefined}
            onSizeClick={(size) => openSize(shown.id, size)}
            onClose={() => select(null)}
          />
        )}
      </Collapse>
    </>
  );
}
