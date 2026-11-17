import { useState } from "react";
import { useAvitoLink } from "@/shared/avito";
import { PRINTER_MODEL, PRINTER_STATUS, usePrinterLink, usePrinterSettings } from "@/shared/printer";
import { PageHeader } from "@/shared/ui";
import { AvitoExtension } from "./AvitoExtension/AvitoExtension";
import { ClearData } from "./ClearData/ClearData";
import { CONNECTIONS, useConnections } from "./connections";
import { ConnectionForm, connectionStatus } from "./ConnectionForm/ConnectionForm";
import { PrinterForm } from "./PrinterForm/PrinterForm";
import { SettingsSection } from "./SettingsSection/SettingsSection";
import styles from "./SettingsPage.module.css";

type SectionId = "avito" | "extension" | "telegram" | "printer" | "auth" | "data";

// Настройки кабинета: раскрывающиеся разделы. Описание — docs/SETTINGS.md.
export default function SettingsPage() {
  const connections = useConnections();
  const printer = usePrinterSettings();
  const printerLink = usePrinterLink();
  const avitoLink = useAvitoLink();
  // Ссылка с пульта «/settings#printer» сразу раскрывает раздел принтера.
  const [open, setOpen] = useState<Set<SectionId>>(() => new Set(window.location.hash === "#printer" ? ["printer"] : []));

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
          Ключи Авито и Telegram и настройки принтера хранятся только в этом браузере и на сервер не уходят — на
          каждом компе их вносят отдельно.
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
          title="Расширение Авито"
          description="Забирает заказы из кабинета Авито: номер, службу, статус, номер отправления."
          status={avitoLink.version ? { tone: "success", label: "На связи" } : { tone: "neutral", label: "Не установлено" }}
          {...sectionProps("extension")}
        >
          <AvitoExtension version={avitoLink.version} />
        </SettingsSection>

        <SettingsSection
          title="Принтер"
          description={`${PRINTER_MODEL} на складе: печать бирок с пульта.`}
          status={PRINTER_STATUS[printerLink.state]}
          {...sectionProps("printer")}
        >
          <PrinterForm saved={printer} />
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

        <SettingsSection
          title="Данные"
          description="Очистить кабинет и начать с чистого листа."
          status={{ tone: "neutral", label: "Осторожно" }}
          {...sectionProps("data")}
        >
          <ClearData />
        </SettingsSection>
      </div>
    </>
  );
}
