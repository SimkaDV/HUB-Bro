import { useEffect, useState } from "react";
import { applyDelivery, cancelDelivery, newId } from "./delivery";
import { MOCK_MODELS } from "./mockData";
import type { DeliveryDraft, DeliveryInput, Model } from "./types";

// Пока нет бэкенда, склад живёт в браузере (localStorage), чтобы поставки и черновики
// не пропадали при обновлении страницы. Потом здесь будут запросы к API.

const STORAGE_KEY = "hubbro.stock.v1";

type StockState = { models: Model[]; drafts: DeliveryDraft[] };

function load(): StockState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as StockState;
  } catch {
    // Повреждённые данные — начинаем с тестовых.
  }
  return { models: MOCK_MODELS, drafts: [] };
}

export function useStockStore() {
  const [state, setState] = useState<StockState>(load);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Хранилище недоступно — работаем без сохранения.
    }
  }, [state]);

  return {
    models: state.models,
    drafts: state.drafts,

    addDelivery(input: DeliveryInput, draftId?: string) {
      setState((s) => ({
        models: applyDelivery(s.models, input),
        drafts: s.drafts.filter((d) => d.id !== draftId),
      }));
    },

    cancelDelivery(modelId: string, batchId: string) {
      setState((s) => ({ ...s, models: cancelDelivery(s.models, modelId, batchId) }));
    },

    /** Сохраняет черновик и возвращает его id (новый или тот же). */
    saveDraft(input: DeliveryInput, draftId?: string) {
      const id = draftId ?? newId();
      const draft: DeliveryDraft = { ...input, id, updatedAt: new Date().toISOString() };
      setState((s) => ({ ...s, drafts: [draft, ...s.drafts.filter((d) => d.id !== id)] }));
      return id;
    },

    deleteDraft(id: string) {
      setState((s) => ({ ...s, drafts: s.drafts.filter((d) => d.id !== id) }));
    },

    resetToMock() {
      setState({ models: MOCK_MODELS, drafts: [] });
    },
  };
}
