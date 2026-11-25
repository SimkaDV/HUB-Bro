import { useState } from "react";
import { useSyncState } from "@/shared/lib/sync";
import { Button } from "@/shared/ui";
import { clearAllData } from "../clearData";
import styles from "./ClearData.module.css";

// Раздел «Данные»: очистить кабинет до первого запуска. Подтверждение — тут же, второй кнопкой.
export function ClearData() {
  const sync = useSyncState();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Без связи сервер потом вернёт старые данные — очищать нельзя.
  const offline = sync === "error" || sync === "connecting";
  const server = sync !== "local";

  const run = async () => {
    setBusy(true);
    setError("");
    try {
      await clearAllData();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <div className={styles.box}>
      <p className={styles.text}>
        Кабинет станет как при первом запуске: удалятся склад (модели, категории, поставки, история), заказы, партии
        печати, объявления, порядок служб, ключи Авито и Telegram, настройки и выбор принтера.
        {server ? " Склад, заказы, партии и объявления удалятся у всех — на сервере." : " Данные удалятся в этом браузере."}
        {" "}Модели с данными бота (описание, сетка, фото) останутся в каталоге — без поставок и остатков.
      </p>

      {!confirming ? (
        <Button variant="secondary" className={styles.danger} disabled={offline} onClick={() => setConfirming(true)}>
          Очистить все данные
        </Button>
      ) : (
        <div className={styles.confirm} role="alertdialog" aria-label="Подтверждение очистки">
          <p className={styles.question}>Удалить всё безвозвратно? Это не отменить.</p>
          <div className={styles.actions}>
            <Button className={styles.dangerSolid} disabled={busy || offline} onClick={() => void run()}>
              {busy ? "Очищаю…" : "Да, очистить"}
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => setConfirming(false)}>
              Отмена
            </Button>
          </div>
        </div>
      )}

      {offline && <p className={styles.error}>Нет связи с сервером — очистить нельзя, иначе старые данные вернутся.</p>}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
