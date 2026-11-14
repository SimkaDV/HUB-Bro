import { useEffect, useState } from "react";
import { applyDelivery, cancelDelivery, newId } from "./delivery";
import { MOCK_MODELS } from "./mockData";
import { DEFAULT_DISPLAY, ensureCategories } from "./settings";
import type { Category, DeliveryDraft, DeliveryInput, DisplaySettings, Model, SettingsLogEntry } from "./types";

// Пока нет бэкенда, склад живёт в браузере (localStorage), чтобы поставки, черновики и настройки
// не пропадали при обновлении страницы. Потом здесь будут запросы к API.

// v3: категории, отображение и журнал настроек. v2: сумма поставки и шаг в черновиках.
const STORAGE_KEY = "hubbro.stock.v3";

type StockState = {
  models: Model[];
  drafts: DeliveryDraft[];
  categories: Category[];
  display: DisplaySettings;
  log: SettingsLogEntry[];
};

type SettingsPatch = Partial<Pick<StockState, "models" | "categories" | "display">>;

const mockState = (): StockState => ({
  models: MOCK_MODELS,
  drafts: [],
  categories: ensureCategories([], MOCK_MODELS),
  display: DEFAULT_DISPLAY,
  log: [],
});

function load(): StockState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...mockState(), ...(JSON.parse(raw) as Partial<StockState>) };
  } catch {
    // Повреждённые данные — начинаем с тестовых.
  }
  return mockState();
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
    ...state,

    addDelivery(input: DeliveryInput, draftId?: string) {
      setState((s) => {
        const models = applyDelivery(s.models, input);
        return {
          ...s,
          models,
          categories: ensureCategories(s.categories, models),
          drafts: s.drafts.filter((d) => d.id !== draftId),
        };
      });
    },

    cancelDelivery(modelId: string, batchId: string) {
      setState((s) => ({ ...s, models: cancelDelivery(s.models, modelId, batchId) }));
    },

    /** Изменение настроек: применяет правку и пишет запись в историю. */
    changeSettings(text: string, update: (s: StockState) => SettingsPatch) {
      setState((s) => ({
        ...s,
        ...update(s),
        log: [{ id: newId(), at: new Date().toISOString(), text }, ...s.log],
      }));
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
      setState(mockState());
    },
  };
}

export type ChangeSettings = ReturnType<typeof useStockStore>["changeSettings"];
