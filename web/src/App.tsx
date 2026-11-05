import { useEffect, useState } from "react";
import { api, getToken, setToken } from "./api";
import { useApi, useHashRoute } from "./hooks";
import { Batches } from "./pages/Batches";
import { Fulfillment } from "./pages/Fulfillment";
import { Login } from "./pages/Login";
import { Orders } from "./pages/Orders";
import { Problems } from "./pages/Problems";
import { Products } from "./pages/Products";
import { Stations } from "./pages/Stations";
import type { User } from "./types";

const PAGES: Record<string, { title: string; el: () => JSX.Element }> = {
  fulfillment: { title: "Комплектация", el: Fulfillment },
  orders: { title: "Заказы", el: Orders },
  batches: { title: "Партии", el: Batches },
  problems: { title: "Проблемы", el: Problems },
  products: { title: "Каталог", el: Products },
  stations: { title: "Принтеры", el: Stations },
};

const ROLE: Record<string, string> = {
  owner: "Владелец", shop_admin: "Админ магазина", operator: "Оператор", buyer: "Закупщик", analyst: "Аналитик", tech_admin: "Тех. админ",
};

function IntegrationBadge() {
  const { data } = useApi<{ mode: string }>("/api/integrations/status");
  if (!data) return null;
  return data.mode === "mock"
    ? <span className="badge warn" title="Заказы тестовые: API заказов Авито станет доступен после подключения Доставки для бизнеса">Авито: тестовые данные</span>
    : <span className="badge ok">Авито: подключено</span>;
}

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [checked, setChecked] = useState(!getToken());
  const [route, go] = useHashRoute();

  useEffect(() => {
    if (getToken()) api<User>("/api/auth/me").then(setUser).catch(() => setToken(null)).finally(() => setChecked(true));
    const out = () => setUser(null);
    window.addEventListener("hubbro:logout", out);
    return () => window.removeEventListener("hubbro:logout", out);
  }, []);

  if (!checked) return null;
  if (!user) return <Login onLogin={setUser} />;

  const Page = (PAGES[route] ?? PAGES.fulfillment).el;
  return (
    <div className="shell">
      <nav className="side">
        <div className="logo">HUB BRO</div>
        {Object.entries(PAGES).map(([k, p]) => (
          <a key={k} href={`#/${k}`} className={route === k ? "active" : ""} onClick={() => go(k)}>{p.title}</a>
        ))}
        <div className="side-foot">
          <IntegrationBadge />
          <div className="muted">{user.name}<br />{ROLE[user.role] ?? user.role}</div>
          <button className="ghost small" onClick={() => { api("/api/auth/logout", { method: "POST" }).catch(() => {}); setToken(null); setUser(null); }}>Выйти</button>
        </div>
      </nav>
      <main><Page /></main>
    </div>
  );
}
