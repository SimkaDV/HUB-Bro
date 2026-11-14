import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "@/app/App";
import { startReserveSync } from "@/shared/fulfillment";
import "@/shared/styles/tokens.css";
import "@/shared/styles/global.css";

// Заказы сверяются со складом сразу и после каждого изменения — на любом экране.
startReserveSync();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
