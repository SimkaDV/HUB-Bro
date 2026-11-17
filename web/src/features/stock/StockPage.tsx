import { useMemo, useState } from "react";
import { Button, Card, PageHeader } from "@/shared/ui";
import { DeliveryDialog } from "./DeliveryDialog/DeliveryDialog";
import { isModelVisible, lineQty } from "./delivery";
import { HistoryView } from "./HistoryView/HistoryView";
import { resolveThresholds, StockSettingsContext } from "./settings";
import { SettingsView } from "./SettingsView/SettingsView";
import { StockOverview } from "./StockOverview/StockOverview";
import { useStockStore } from "./store";
import { Toast } from "./Toast/Toast";
import styles from "./StockPage.module.css";

type View = "stock" | "history" | "settings";

const TITLES: Record<View, string> = { stock: "Склад", history: "История склада", settings: "Настройки склада" };

export default function StockPage() {
  const store = useStockStore();
  const [view, setView] = useState<View>("stock");
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const notify = (text: string) => setToast({ id: Date.now(), text });

  const settings = useMemo(
    () => ({ thresholdsFor: (m: Parameters<typeof resolveThresholds>[0]) => resolveThresholds(m, store.categories), display: store.display }),
    [store.categories, store.display],
  );

  // Повторное нажатие на кнопку открытой вкладки возвращает на остатки.
  const toggle = (v: View) => setView(view === v ? "stock" : v);

  return (
    <StockSettingsContext.Provider value={settings}>
      <PageHeader
        title={TITLES[view]}
        subtitle="Модели, остатки и поставки"
        actions={
          <>
            <Button onClick={() => setDeliveryOpen(true)}>+ Поставка</Button>
            <Button variant={view === "history" ? "primary" : "secondary"} onClick={() => toggle("history")}>
              История
            </Button>
            <Button
              variant={view === "settings" ? "primary" : "secondary"}
              onClick={() => toggle("settings")}
              aria-label="Настройки склада"
            >
              <GearIcon /> Настройки
            </Button>
          </>
        }
      />

      {view !== "stock" && (
        <button type="button" className={styles.back} onClick={() => setView("stock")}>
          ← К остаткам
        </button>
      )}

      <div className={styles.view} key={view}>
        {view === "stock" &&
          (store.models.length === 0 ? (
            <Card className={styles.empty}>
              <h2 className={styles.emptyTitle}>Склад пуст — начните с модели</h2>
              <p>
                Нажмите «+ Поставка» и в ней «+ Новая модель» — модель заведётся вместе с первыми джинсами. Или
                заведите её без поставки в настройках склада: сначала категория с размерами, потом модель.
              </p>
              <p>Потом подключите Авито в настройках кабинета и привяжите объявления к моделям — тогда заказы узнают товар.</p>
              <div className={styles.emptyActions}>
                <Button onClick={() => setDeliveryOpen(true)}>+ Поставка</Button>
                <Button variant="secondary" onClick={() => setView("settings")}>
                  Завести модель в настройках
                </Button>
              </div>
            </Card>
          ) : (
            <StockOverview models={store.models.filter(isModelVisible)} />
          ))}
        {view === "history" && (
          <HistoryView
            models={store.models}
            log={store.log}
            onCancel={(modelId, batchId) => {
              store.cancelDelivery(modelId, batchId);
              notify("Поставка отменена, остатки убраны со склада");
            }}
          />
        )}
        {view === "settings" && (
          <SettingsView
            models={store.models}
            categories={store.categories}
            display={store.display}
            change={(text, update) => {
              store.changeSettings(text, update);
              notify("Сохранено");
            }}
          />
        )}
      </div>

      {deliveryOpen && (
        <DeliveryDialog
          models={store.models}
          categories={store.categories}
          drafts={store.drafts}
          onSubmit={(input, draftId) => {
            store.addDelivery(input, draftId);
            const qty = input.lines.reduce((s, l) => s + lineQty(l), 0);
            const n = input.lines.length;
            notify(n > 1 ? `Добавлено ${n} поставки: ${qty} шт.` : `Поставка добавлена: ${qty} шт.`);
          }}
          onSaveDraft={store.saveDraft}
          onDeleteDraft={store.deleteDraft}
          onClose={() => setDeliveryOpen(false)}
        />
      )}

      <Toast message={toast} />
    </StockSettingsContext.Provider>
  );
}

function GearIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  );
}
