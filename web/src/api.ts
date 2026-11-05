const TOKEN_KEY = "hubbro.token";

export function getToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

export function setToken(t: string | null) {
  try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch { /* приватный режим */ }
}

export class ApiError extends Error {
  constructor(public status: number, message: string, public detail?: unknown) { super(message); }
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  const r = await fetch(path, {
    method: init.method ?? (init.body !== undefined ? "POST" : "GET"),
    headers, body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  if (r.status === 401 && token) {
    setToken(null);
    window.dispatchEvent(new Event("hubbro:logout"));
  }
  const data = r.status === 204 ? null : await r.json().catch(() => null);
  if (!r.ok) {
    const d = data?.detail;
    const msg = typeof d === "string" ? d : d?.message ?? `Ошибка ${r.status}`;
    throw new ApiError(r.status, msg, d);
  }
  return data as T;
}

/** Открыть PDF этикетки (резервный способ печати). Файл защищён токеном, поэтому через blob. */
export async function openLabelPdf(labelId: number) {
  const r = await fetch(`/api/labels/${labelId}/file`, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!r.ok) throw new ApiError(r.status, "Не удалось открыть PDF");
  const url = URL.createObjectURL(await r.blob());
  window.open(url, "_blank");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
