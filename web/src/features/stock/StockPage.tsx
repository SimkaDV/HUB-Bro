import { useState } from "react";
import { Button, PageHeader } from "@/shared/ui";
import { DeliveryDialog } from "./DeliveryDialog/DeliveryDialog";
import { isModelVisible, lineQty } from "./delivery";
import { HistoryView } from "./HistoryView/HistoryView";
import { StockOverview } from "./StockOverview/StockOverview";
import { useStockStore } from "./store";
import { Toast } from "./Toast/Toast";
import styles from "./StockPage.module.css";

export default function StockPage() {
  const store = useStockStore();
  const [view, setView] = useState<"stock" | "history">("stock");
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const notify = (text: string) => setToast({ id: Date.now(), text });

  return (
    <>
      <PageHeader
        title={view === "stock" ? "Склад" : "История склада"}
        subtitle="Тестовые данные хранятся в этом браузере, к базе подключим позже"
        actions={
          <>
            <Button onClick={() => setDeliveryOpen(true)}>+ Поставка</Button>
            <Button variant="secondary" onClick={() => setView(view === "stock" ? "history" : "stock")}>
              {view === "stock" ? "История" : "Остатки"}
            </Button>
          </>
        }
      />

      <div className={styles.view} key={view}>
        {view === "stock" ? (
          <StockOverview models={store.models.filter(isModelVisible)} />
        ) : (
          <HistoryView
            models={store.models}
            onCancel={(modelId, batchId) => {
              store.cancelDelivery(modelId, batchId);
              notify("Поставка отменена, остатки убраны со склада");
            }}
          />
        )}
      </div>

      {deliveryOpen && (
        <DeliveryDialog
          models={store.models}
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
    </>
  );
}
