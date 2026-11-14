import { PageHeader } from "@/shared/ui";
import { CONNECTIONS, useConnections } from "./connections";
import { ConnectionCard } from "./ConnectionCard/ConnectionCard";
import styles from "./SettingsPage.module.css";

// Настройки кабинета. Пока только подключения; доступы добавим позже. Описание — docs/SETTINGS.md.
export default function SettingsPage() {
  const connections = useConnections();

  return (
    <>
      <PageHeader title="Настройки" subtitle="Подключения к Авито и Telegram" />

      <div className={styles.list}>
        <p className={styles.note}>
          Пока сервера нет, ключи хранятся только в этом браузере и никуда не отправляются. Проверить, что они
          рабочие, сможем, когда подключим сервер.
        </p>
        {CONNECTIONS.map((def) => (
          <ConnectionCard key={def.id} def={def} saved={connections[def.id]} />
        ))}
      </div>
    </>
  );
}
