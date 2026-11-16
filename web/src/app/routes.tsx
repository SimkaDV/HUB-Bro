import type { ReactElement } from "react";
import PickingPage from "@/features/picking/PickingPage";
import OrdersPage from "@/features/orders/OrdersPage";
import StockPage from "@/features/stock/StockPage";
import LabelsPage from "@/features/labels/LabelsPage";
import ListingsPage from "@/features/listings/ListingsPage";
import SettingsPage from "@/features/settings/SettingsPage";

export type AppRoute = {
  path: string;
  label: string;
  element: ReactElement;
};

// Единый список разделов: из него строятся и роуты, и боковое меню.
export const routes: AppRoute[] = [
  { path: "/labels", label: "Пульт", element: <LabelsPage /> },
  { path: "/picking", label: "Комплектация", element: <PickingPage /> },
  { path: "/stock", label: "Склад", element: <StockPage /> },
  { path: "/orders", label: "Заказы", element: <OrdersPage /> },
  { path: "/listings", label: "Объявления", element: <ListingsPage /> },
  { path: "/settings", label: "Настройки", element: <SettingsPage /> },
];

export const defaultPath = "/stock";
