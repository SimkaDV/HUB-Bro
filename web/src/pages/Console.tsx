import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { loadTarget, PrintTarget, Target } from "../components/PrintTarget";
import { ErrorLine, Modal } from "../components/ui";
import { useApi } from "../hooks";
import type { Order, Preview, Product, Shop, Station } from "../types";

type Filters = { shop_id?: number; model?: string; size?: string; pvz_name?: string; deadline_hours?: number };
type Preset = { id: number; name: string; filters: Filters; ready: number };
type ConsoleData = { ready: number; problems: number; ready_by_shop: Record<string, number>; urgent: number; failed_jobs: number; presets: Preset[] };

/** Экран подтверждения и прогресса печати партии. */
function PrintFlow({ batchId, target, onDone }: { batchId: number; target: Target; onDone: (msg?: string) => void }) {
  const { data: b, reload } = useApi<Preview>(`/api/print-batches/${batchId}/preview`, 1500);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const print = useCallback(async () => {
    if (busy) return;
    setBusy(true); setError(null);
    try { await api(`/api/print-batches/${batchId}/print`, { body: target }); await reload(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }, [batchId, target, busy, reload]);

  const cancel = useCallback(async () => {
    await api(`/api/print-batches/${batchId}/cancel`, { method: "POST" }).catch(() => {});
    onDone();
  }, [batchId, onDone]);

  const draft = b?.status === "draft";
  useEffect(() => {
    if (!draft) return;
    const on = (e: KeyboardEvent) => {
      if (e.key === "Enter") { e.preventDefault(); print(); }
      if (e.key === "Escape") cancel();
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [draft, print, cancel]);

  if (!b) return <div className="console-card">Загрузка…</div>;
  const name = String(b.filters.name ?? b.code);
  const total = b.labels_count;
  const left = b.jobs.queued + b.jobs.sent;

  return (
    <div className="console-card confirm">
      <div className="muted">{name} · {b.code}</div>
      {draft ? (
        <>
          <div className="confirm-count"><b>{total}</b> этикет{total % 10 === 1 && total % 100 !== 11 ? "ка" : "ок"}</div>
          <div className="chips">
            {Object.entries(b.summary.shop).map(([k, v]) => <span key={k} className="chip">{k} · {v}</span>)}
            {Object.entries(b.summary.model).map(([k, v]) => <span key={k} className="chip muted-chip">{k} · {v}</span>)}
          </div>
          <button className="primary huge" disabled={busy || !target.station_id} onClick={print}>⎙ Печатать</button>
          <button className="ghost wide" onClick={cancel}>Отмена</button>
          <div className="muted center">Enter — печатать, Esc — отмена</div>
        </>
      ) : (
        <>
          <div className="confirm-count"><b>{b.jobs.done}</b> из {total}</div>
          <div className="progress"><div style={{ width: `${(b.jobs.done / Math.max(total, 1)) * 100}%` }} />{b.jobs.failed > 0 && <div className="fail" style={{ width: `${(b.jobs.failed / total) * 100}%` }} />}</div>
          <div className="muted center">
            {left > 0 ? `В очереди принтера: ${left}` : b.jobs.failed ? `Сбой: ${b.jobs.failed}` : "Готово. Сверьте ленту."}
          </div>
          {b.jobs.failed > 0 && left === 0 &&
            <button className="primary huge" onClick={async () => { await api(`/api/print-batches/${batchId}/retry`, { method: "POST" }); reload(); }}>Повторить сбойные ({b.jobs.failed})</button>}
          <button className={left === 0 && !b.jobs.failed ? "primary huge" : "ghost wide"} onClick={() => onDone(left ? "Печать продолжается — статус в «Партиях»" : undefined)}>
            {left ? "Свернуть" : "Готово"}
          </button>
        </>
      )}
      <ErrorLine error={error} />
    </div>
  );
}

function PresetForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { data: shops } = useApi<Shop[]>("/api/shops");
  const { data: products } = useApi<Product[]>("/api/products");
  const { data: queue } = useApi<{ orders: Order[] }>("/api/fulfillment/queue");
  const [f, setF] = useState<Filters>({});
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const uniq = (xs: (string | null | undefined)[]) => [...new Set(xs.filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, "ru", { numeric: true }));
  const models = useMemo(() => uniq(products?.map((p) => p.model) ?? []), [products]);
  const sizes = useMemo(() => uniq(products?.map((p) => p.size) ?? []), [products]);
  const pvz = useMemo(() => uniq(queue?.orders.map((o) => o.pvz_name) ?? []), [queue]);
  const autoName = [shops?.find((s) => s.id === f.shop_id)?.name, f.model, f.size, f.pvz_name, f.deadline_hours && `срок ≤ ${f.deadline_hours} ч`].filter(Boolean).join(" · ");
  const set = (k: keyof Filters, v: string) => setF({ ...f, [k]: v === "" ? undefined : k === "shop_id" || k === "deadline_hours" ? Number(v) : v });

  return (
    <Modal title="Новый пресет" onClose={onClose}>
      <div className="form-grid">
        <label className="field"><span>Магазин</span>
          <select value={f.shop_id ?? ""} onChange={(e) => set("shop_id", e.target.value)}>
            <option value="">Все</option>{shops?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select></label>
        <label className="field"><span>Модель</span>
          <select value={f.model ?? ""} onChange={(e) => set("model", e.target.value)}>
            <option value="">Все</option>{models.map((m) => <option key={m}>{m}</option>)}
          </select></label>
        <label className="field"><span>Размер</span>
          <select value={f.size ?? ""} onChange={(e) => set("size", e.target.value)}>
            <option value="">Все</option>{sizes.map((m) => <option key={m}>{m}</option>)}
          </select></label>
        <label className="field"><span>ПВЗ</span>
          <select value={f.pvz_name ?? ""} onChange={(e) => set("pvz_name", e.target.value)}>
            <option value="">Все</option>{pvz.map((m) => <option key={m}>{m}</option>)}
          </select></label>
        <label className="field"><span>Срок отправки</span>
          <select value={f.deadline_hours ?? ""} onChange={(e) => set("deadline_hours", e.target.value)}>
            <option value="">Любой</option><option value="6">Горит — до 6 ч</option><option value="24">Сегодня — до 24 ч</option><option value="48">До 2 дней</option>
          </select></label>
        <label className="field"><span>Название</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={autoName || "Всё готовое"} /></label>
      </div>
      <ErrorLine error={error} />
      <button className="primary mt" onClick={async () => {
        try { await api("/api/presets", { body: { name: name.trim() || autoName || "Всё готовое", filters: f } }); onSaved(); onClose(); }
        catch (e) { setError((e as Error).message); }
      }}>Сохранить</button>
    </Modal>
  );
}

function ScanReprint({ target }: { target: Target }) {
  const [code, setCode] = useState("");
  const [found, setFound] = useState<Order | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const find = async () => {
    setError(null); setMsg(null); setFound(null);
    const orders = await api<Order[]>(`/api/orders?q=${encodeURIComponent(code.trim())}`).catch((e) => { setError(e.message); return []; });
    const withLabel = orders.filter((o) => o.label);
    if (withLabel.length === 1) setFound(withLabel[0]);
    else setError(withLabel.length ? `Найдено ${withLabel.length} заказов — уточните код` : "Этикетка не найдена");
  };

  return (
    <div className="console-card">
      <div className="row between"><b>Перепечатать по скану</b><span className="muted">L-000123, № заказа или № Авито</span></div>
      <input className="scan" value={code} placeholder="Отсканируйте или введите код" onChange={(e) => setCode(e.target.value)}
             onKeyDown={(e) => e.key === "Enter" && code.trim() && find()} />
      {found && (
        <div className="row gap mt">
          <span>{found.label!.code} · заказ #{found.id} · {found.items[0]?.product ? `${found.items[0].product.model} ${found.items[0].product.size}` : found.items[0]?.title}</span>
          <button className="primary" autoFocus disabled={!target.station_id} onClick={async () => {
            try {
              await api(`/api/labels/${found.label!.id}/reprint`, { body: { ...target, reason: "Перепечатка по скану" } });
              setMsg(`${found.label!.code} отправлена на принтер`); setFound(null); setCode("");
            } catch (e) { setError((e as Error).message); }
          }}>⎙ Перепечатать</button>
        </div>
      )}
      {msg && <div className="ok-line">{msg}</div>}
      <ErrorLine error={error} />
    </div>
  );
}

export function Console() {
  const { data, error, reload } = useApi<ConsoleData>("/api/console", 8000);
  const { data: shops } = useApi<Shop[]>("/api/shops");
  const { data: stations } = useApi<Station[]>("/api/stations", 10_000);
  const [target, setTarget] = useState<Target>(loadTarget);
  const [pickPrinter, setPickPrinter] = useState(false);
  const [batchId, setBatchId] = useState<number | null>(null);
  const [newPreset, setNewPreset] = useState(false);
  const [scan, setScan] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const onTarget = useCallback((t: Target) => setTarget(t), []);
  const station = stations?.find((s) => s.id === target.station_id);

  const start = async (body: object) => {
    setErr(null); setNote(null);
    try { setBatchId((await api<{ id: number }>("/api/console/batch", { body })).id); }
    catch (e) { setErr((e as Error).message); reload(); }
  };

  const shopName = (id: string) => shops?.find((s) => s.id === Number(id))?.name ?? id;

  return (
    <div className="console">
      <button className="printer-line" onClick={() => setPickPrinter(!pickPrinter)}>
        <span className={`dot ${station?.online ? "on" : "off"}`} />
        {station ? <>{station.name} · {target.printer_name ?? station.default_printer ?? "принтер по умолчанию"} · {station.online ? "в сети" : "не в сети"}</> : "Принтер не выбран"}
        <span className="muted">сменить</span>
      </button>
      {(pickPrinter || (stations && !station)) && <div className="console-card"><PrintTarget value={target} onChange={onTarget} /></div>}

      {batchId ? (
        <PrintFlow batchId={batchId} target={target} onDone={(m) => { setBatchId(null); setNote(m ?? null); reload(); }} />
      ) : (
        <>
          <button className="hero" disabled={!data?.ready} onClick={() => start({})}>
            <span>⎙ Печатать всё готовое</span><b>{data?.ready ?? "…"}</b>
          </button>
          {data && Object.keys(data.ready_by_shop).length > 1 && (
            <div className="shop-split">
              {Object.entries(data.ready_by_shop).map(([id, n]) => (
                <button key={id} onClick={() => start({ filters: { shop_id: Number(id) } })}>{shopName(id)} <b>{n}</b></button>
              ))}
            </div>
          )}

          <div className="tiles">
            {data && data.urgent > 0 && (
              <div className="tile urgent">
                <span>Горит · до 6 ч</span><b>{data.urgent}</b>
                <button onClick={() => start({ filters: { deadline_hours: 6 } })}>⎙ Печать</button>
              </div>
            )}
            {data?.presets.map((p) => (
              <div key={p.id} className={`tile ${p.ready ? "" : "empty-tile"}`}>
                <span title={p.name}>{p.name}</span><b>{p.ready}</b>
                <button disabled={!p.ready} onClick={() => start({ preset_id: p.id })}>⎙ Печать</button>
                <button className="tile-x" aria-label={`Удалить пресет ${p.name}`}
                        onClick={async () => { if (confirm(`Удалить пресет «${p.name}»?`)) { await api(`/api/presets/${p.id}`, { method: "DELETE" }); reload(); } }}>✕</button>
              </div>
            ))}
            <button className="tile add-tile" onClick={() => setNewPreset(true)}>+ Пресет</button>
          </div>

          <div className="actions">
            <button onClick={async () => { await api("/api/integrations/sync", { method: "POST" }).catch((e) => setErr(e.message)); reload(); }}>↻ Обновить из Авито</button>
            <button disabled={!data?.failed_jobs} onClick={async () => {
              const r = await api<{ requeued: number }>("/api/console/retry-failed", { method: "POST" });
              setNote(`Повторно отправлено: ${r.requeued}`); reload();
            }}>⟲ Повторить сбойные ({data?.failed_jobs ?? 0})</button>
            <a className="btn-link danger" href="#/problems">⚠ Проблемы ({data?.problems ?? 0})</a>
            <button onClick={() => setScan(!scan)}>⌁ Перепечатать по скану</button>
          </div>
          {scan && <ScanReprint target={target} />}
        </>
      )}
      {note && <div className="ok-line">{note}</div>}
      <ErrorLine error={err ?? error} />
      {newPreset && <PresetForm onClose={() => setNewPreset(false)} onSaved={reload} />}
    </div>
  );
}
