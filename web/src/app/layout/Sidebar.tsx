import { NavLink } from "react-router-dom";
import { useSyncInfo, type SyncInfo, type SyncState } from "@/shared/lib/sync";
import { routes } from "../routes";
import styles from "./Sidebar.module.css";

const SYNC_LABEL: Record<SyncState, string> = {
  local: "Данные в этом браузере",
  connecting: "Подключаемся к серверу…",
  synced: "Данные на сервере",
  saving: "Сохраняем…",
  error: "Нет связи с сервером",
};

const time = (iso: string) => {
  const d = new Date(iso);
  const hm = d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  return d.toDateString() === new Date().toDateString()
    ? hm
    : `${d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })} ${hm}`;
};

function syncLabel({ state, savedAt, replaced, rejected }: SyncInfo) {
  if (state === "error" && rejected) return "Сервер не принял данные";
  if (state === "synced" && replaced) return "Данные обновились с другого компьютера";
  if (state === "synced" && savedAt) return `Сохранено на сервере в ${time(savedAt)}`;
  return SYNC_LABEL[state];
}

export default function Sidebar() {
  const info = useSyncInfo();
  const sync = info.state;
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
        title={
          sync === "error"
            ? info.rejected
              ? `${info.error}. Эти правки на сервер не сохранены.`
              : `${info.error}. Правки сейчас не сохраняются на сервер.`
            : info.replaced
              ? "На сервере были данные новее — взяли их, последняя правка здесь не сохранилась"
              : undefined
        }
        role="status"
      >
        {syncLabel(info)}
        {/* Сервер не принял данные — что именно не так (ошибки проверки формата), чтобы было что исправить. */}
        {sync === "error" && info.rejected && <span className={styles.syncDetail}>{info.error}</span>}
      </p>
    </aside>
  );
}
