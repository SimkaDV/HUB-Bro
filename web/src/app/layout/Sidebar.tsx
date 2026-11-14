import { NavLink } from "react-router-dom";
import { routes } from "../routes";
import styles from "./Sidebar.module.css";

export default function Sidebar() {
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
    </aside>
  );
}
