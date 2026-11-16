import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "@/app/App";
import { startAvitoBridge } from "@/shared/avito";
import { batchesStore, startReserveSync } from "@/shared/fulfillment";
import { startServerSync } from "@/shared/lib/sync";
import { listingsStore } from "@/shared/listings";
import { ordersStore } from "@/shared/orders";
import { stockStore } from "@/shared/stock";
import "@/shared/styles/tokens.css";
import "@/shared/styles/global.css";

const root = ReactDOM.createRoot(document.getElementById("root")!);

// Сначала данные с сервера (на новом компе — вместо тестовых), потом сверка и экраны.
// Ключи Авито/Telegram и настройки принтера на сервер не уходят — они свои у каждого браузера.
await startServerSync([ordersStore, stockStore, batchesStore, listingsStore]);
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
