export type Shop = { id: number; name: string; code: string; logo_url: string | null; avito_account_id: string | null };

export type Product = {
  id: number; sku: string; title: string; category: string; model: string; size: string; color: string;
  location_code: string | null; on_hand: number; reserved: number; quarantine: number; available: number;
};

export type LabelInfo = {
  id: number; code: string; order_id: number; valid: boolean; invalid_reason: string | null;
  print_count: number; is_mock: boolean; created_at: string;
};

export type OrderItem = {
  id: number; external_item_id: string; title: string; qty: number; price: number;
  sku: string | null; reserved: boolean; product: Product | null;
};

export type Order = {
  id: number; shop: Shop; external_order_id: string; marketplace_id: string | null;
  external_status: string | null; internal_status: string; delivery_type: string | null;
  pvz_name: string | null; pvz_address: string | null; deadline_at: string | null; ordered_at: string | null;
  updated_at: string; items: OrderItem[]; label: LabelInfo | null;
  batch: { id: number; code: string; status: string } | null;
};

export type OrderDetail = Order & {
  raw_payload: unknown; labels: LabelInfo[];
  history: { at: string; type: string; action: string; data: Record<string, unknown>; user_id: number | null }[];
};

export type Job = {
  id: number; batch_id: number | null; label_id: number | null; label_code: string | null; order_id: number | null;
  kind: string; status: "queued" | "sent" | "done" | "failed"; attempt: number; reason: string | null;
  error: string | null; printer_name: string | null; created_at: string; updated_at: string;
};

export type Batch = {
  id: number; code: string; status: string; created_at: string; closed_at: string | null;
  station_id: number | null; printer_name: string | null; orders_count: number;
  jobs: Record<Job["status"], number>; orders?: Order[]; job_list?: Job[];
};

export type Preview = Batch & {
  labels_count: number; summary: Record<"shop" | "model" | "size" | "pvz", Record<string, number>>;
  problems: Record<string, string>;
};

export type Station = {
  id: number; name: string; hostname: string | null; agent_version: string | null; printers: string[];
  default_printer: string | null; last_seen_at: string | null; online: boolean; paired: boolean;
  pairing_code: string | null; pairing_expires_at: string | null;
};

export type User = { id: number; email: string; name: string; role: string; shop_id: number | null };

export type QueueCounts = { total: number; ready: number; in_batch: number; blocked: number; problem: number; printed: number };
