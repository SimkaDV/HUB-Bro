import { useEffect } from "react";
import { useApi } from "../hooks";
import type { Station } from "../types";

const KEY = "hubbro.printTarget";

export type Target = { station_id: number | null; printer_name: string | null };

export function loadTarget(): Target {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "") as Target; } catch { return { station_id: null, printer_name: null }; }
}

function saveTarget(t: Target) {
  try { localStorage.setItem(KEY, JSON.stringify(t)); } catch { /* ignore */ }
}

/** Выбор станции и принтера; запоминается в браузере. */
export function PrintTarget({ value, onChange }: { value: Target; onChange: (t: Target) => void }) {
  const { data: stations } = useApi<Station[]>("/api/stations", 5000);
  const station = stations?.find((s) => s.id === value.station_id) ?? null;

  useEffect(() => {
    if (!stations?.length) return;
    if (!station) {
      const s = stations.find((x) => x.online) ?? stations[0];
      onChange({ station_id: s.id, printer_name: s.default_printer });
    }
  }, [stations, station, onChange]);

  const set = (t: Target) => { saveTarget(t); onChange(t); };

  if (stations && !stations.length) {
    return <div className="hint">Нет станций печати. Добавьте компьютер с принтером в разделе <a href="#/stations">«Принтеры»</a>.</div>;
  }
  return (
    <div className="row gap">
      <label className="field">
        <span>Станция</span>
        <select value={value.station_id ?? ""} onChange={(e) => {
          const s = stations?.find((x) => x.id === Number(e.target.value));
          set({ station_id: s?.id ?? null, printer_name: s?.default_printer ?? null });
        }}>
          {stations?.map((s) => <option key={s.id} value={s.id}>{s.name} {s.online ? "• в сети" : "• не в сети"}</option>)}
        </select>
      </label>
      <label className="field">
        <span>Принтер</span>
        <select value={value.printer_name ?? ""} onChange={(e) => set({ ...value, printer_name: e.target.value || null })}>
          <option value="">По умолчанию на ПК</option>
          {station?.printers.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </label>
      {station && !station.online && <span className="badge bad">⚠ станция не в сети — задания подождут в очереди</span>}
    </div>
  );
}
