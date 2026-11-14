import { useState } from "react";
import { PageHeader } from "@/shared/ui";
import { CONNECTIONS, PRINTER_MODEL, useConnections } from "./connections";
import { ConnectionForm, connectionStatus } from "./ConnectionForm/ConnectionForm";
import { PrinterForm } from "./PrinterForm/PrinterForm";
import { SettingsSection } from "./SettingsSection/SettingsSection";
import styles from "./SettingsPage.module.css";

type SectionId = "avito" | "telegram" | "printer" | "auth";

// Настройки кабинета: раскрывающиеся разделы. Описание — docs/SETTINGS.md.
export default function SettingsPage() {
  const connections = useConnections();
  const [open, setOpen] = useState<Set<SectionId>>(new Set());

  const toggle = (id: SectionId) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const sectionProps = (id: SectionId) => ({ open: open.has(id), onToggle: () => toggle(id) });

  return (
    <>
      <PageHeader title="Настройки" subtitle="Подключения к Авито, Telegram и принтеру" />

      <div className={styles.list}>
        <p className={styles.note}>
          Пока сервера нет, всё хранится только в этом браузере и никуда не отправляется. Проверить, что ключи
          рабочие, сможем, когда подключим сервер.
        </p>

        {CONNECTIONS.map((def) => (
          <SettingsSection
            key={def.id}
            title={def.title}
            description={def.description}
            status={connectionStatus(def, connections[def.id])}
            {...sectionProps(def.id)}
          >
            <ConnectionForm def={def} saved={connections[def.id]} />
          </SettingsSection>
        ))}

        <SettingsSection
          title="Принтер"
          description={`${PRINTER_MODEL} на складе: печать бирок с пульта.`}
          status={{ tone: "neutral", label: "Не подключён" }}
          {...sectionProps("printer")}
        >
          <PrinterForm saved={connections.printer} />
        </SettingsSection>

        <SettingsSection
          title="Авторизация"
          description="Вход в кабинет и доступы."
          status={{ tone: "neutral", label: "Позже" }}
          {...sectionProps("auth")}
        >
          <p className={styles.stub}>
            Пока кабинет открыт всем, у кого есть ссылка. Здесь появятся вход и доступы: кто что может делать на сайте.
          </p>
        </SettingsSection>
      </div>
    </>
  );
}
