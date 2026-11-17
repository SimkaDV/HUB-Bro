import { newId } from "@/shared/lib/id";
import { ensureCategories, stockStore, useStock, type StockState } from "@/shared/stock";
import type { DeliveryDraft, DeliveryInput } from "@/shared/stock";
import { applyDelivery, cancelDelivery } from "./delivery";

// Действия экрана склада. Само состояние общее (shared/stock): его же читает и меняет комплектация.
// Хранится в браузере и на сервере (shared/lib/sync.ts).

type SettingsPatch = Partial<Pick<StockState, "models" | "categories" | "display">>;

const setState = stockStore.set;

export function useStockStore() {
  const state = useStock();

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

  };
}

export type ChangeSettings = ReturnType<typeof useStockStore>["changeSettings"];
