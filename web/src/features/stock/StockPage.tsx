import { useEffect, useRef, useState } from "react";
import { Collapse, PageHeader } from "@/shared/ui";
import { ModelDetail } from "./ModelDetail/ModelDetail";
import { ModelTile } from "./ModelTile/ModelTile";
import { MOCK_MODELS } from "./mockData";
import { LOW_MAX, MID_MAX, modelsByAttention } from "./stock";
import styles from "./StockPage.module.css";

// Совпадает с длительностью затухания .leaving в ModelDetail.module.css.
const SWITCH_FADE_MS = 180;
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export default function StockPage() {
  const models = modelsByAttention(MOCK_MODELS);
  const [selectedId, setSelectedId] = useState<string | null>(models[0]?.id ?? null);
  // Последняя открытая модель: остаётся на экране, пока панель плавно сворачивается.
  const [shownId, setShownId] = useState(selectedId);
  const [leaving, setLeaving] = useState(false);
  const switchTimer = useRef<number>();
  const shown = models.find((m) => m.id === shownId);

  const select = (id: string | null) => {
    window.clearTimeout(switchTimer.current);
    setSelectedId(id);
    setFocus(null);
    if (!id) return;
    if (selectedId === null || reducedMotion()) {
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

  return (
    <>
      <PageHeader title="Склад" subtitle="Тестовые данные, к базе подключим позже" />

      <div className={styles.legend}>
        <span><b className={styles.low}>{LOW_MAX}</b> мало, ≤ {LOW_MAX}</span>
        <span><b className={styles.mid}>{MID_MAX}</b> норм, {LOW_MAX + 1}–{MID_MAX}</span>
        <span><b className={styles.ok}>20</b> много, больше {MID_MAX}</span>
        <span><b className={styles.zero}>0</b> нет</span>
        <span><b>+1</b> возврат едет к нам</span>
      </div>

      <div className={styles.grid}>
        {models.map((m) => (
          <ModelTile
            key={m.id}
            model={m}
            selected={m.id === selectedId}
            onSelect={() => select(m.id === selectedId ? null : m.id)}
            onSizeClick={(size) => openSize(m.id, size)}
          />
        ))}
      </div>

      <Collapse open={selectedId !== null}>
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
