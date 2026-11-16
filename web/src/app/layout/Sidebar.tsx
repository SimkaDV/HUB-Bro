import { NavLink } from "react-router-dom";
import { syncError, useSyncState, type SyncState } from "@/shared/lib/sync";
import { routes } from "../routes";
import styles from "./Sidebar.module.css";

const SYNC_LABEL: Record<SyncState, string> = {
  local: "Данные в этом браузере",
  connecting: "Подключаемся к серверу…",
  synced: "Данные на сервере",
  saving: "Сохраняем…",
  error: "Нет связи с сервером",
};

export default function Sidebar() {
  const sync = useSyncState();
  return (
    <aside className={styles.sidebar}>
      <div className={styles.brand}>
        <img src="/logo.png" alt="" width={44} height={44} />
        <span>HUB BRO</span>
      </div>
      <nav className={styles.nav}>
        {routes.map((route) => (
          <NavLink
            key={route.path}
            to={route.path}
            className={({ isActive }) => (isActive ? `${styles.item} ${styles.active}` : styles.item)}
          >
            {route.label}
          </NavLink>
        ))}
      </nav>
      <p
        className={`${styles.sync} ${sync === "error" ? styles.syncError : ""}`}
        title={sync === "error" ? `${syncError()}. Правки сейчас не сохраняются на сервер.` : undefined}
        role="status"
      >
        {SYNC_LABEL[sync]}
      </p>
    </aside>
  );
}
