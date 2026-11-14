import type { ReactElement } from "react";
import PickingPage from "@/features/picking/PickingPage";
import OrdersPage from "@/features/orders/OrdersPage";
import StockPage from "@/features/stock/StockPage";
import LabelsPage from "@/features/labels/LabelsPage";

export type AppRoute = {
  path: string;
  label: string;
  element: ReactElement;
};

// Единый список разделов: из него строятся и роуты, и боковое меню.
export const routes: AppRoute[] = [
  { path: "/picking", label: "Комплектация", element: <PickingPage /> },
  { path: "/orders", label: "Заказы", element: <OrdersPage /> },
  { path: "/stock", label: "Склад", element: <StockPage /> },
  { path: "/labels", label: "Расклейка", element: <LabelsPage /> },
];

export const defaultPath = "/stock";
