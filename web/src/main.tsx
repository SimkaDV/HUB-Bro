import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "@/app/App";
import { startAvitoBridge } from "@/shared/avito";
import { batchesStore, serviceOrderStore, startReserveSync } from "@/shared/fulfillment";
import { dropOldKeys } from "@/shared/lib/cleanup";
import { startServerSync } from "@/shared/lib/sync";
import { listingsStore } from "@/shared/listings";
import { ordersStore } from "@/shared/orders";
import { catalogStore, hubStore, logStore, stockFileStore } from "@/shared/stock";
import "@/shared/styles/tokens.css";
import "@/shared/styles/global.css";

const root = ReactDOM.createRoot(document.getElementById("root")!);

// Старые версии хранилищ (до чистого старта) больше не читаем — убираем из браузера.
dropOldKeys();
// Сначала данные с сервера данных avito (сервер главнее: там пусто — и у нас пусто), потом сверка и экраны.
// Файлы — avito/data/schema/FORMAT.md; каталог первым, на него ссылаются остальные.
// Ключи Авито/Telegram и настройки принтера на сервер не уходят — они свои у каждого браузера.
await startServerSync([
  catalogStore,
  stockFileStore,
  ordersStore,
  listingsStore,
  batchesStore,
  serviceOrderStore,
  hubStore,
  logStore,
]);
// Заказы сверяются со складом сразу и после каждого изменения — на любом экране.
startReserveSync();
// Заказы из расширения Авито принимаются на любом экране.
startAvitoBridge();

root.render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
