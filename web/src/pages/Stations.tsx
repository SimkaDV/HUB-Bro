import { useState } from "react";
import { api } from "../api";
import { Empty, ErrorLine } from "../components/ui";
import { dt, JOB_STATUS } from "../format";
import { useApi } from "../hooks";
import type { Job, Station } from "../types";

function StationCard({ st, onChange }: { st: Station; onChange: () => void }) {
  const [printer, setPrinter] = useState(st.default_printer ?? "");
  const [error, setError] = useState<string | null>(null);
  const { data: jobs, reload } = useApi<Job[]>(`/api/stations/${st.id}/jobs?limit=8`, 3000);
  const server = window.location.origin.replace(":5173", ":8000");

  const act = async (fn: () => Promise<unknown>) => {
    setError(null);
    try { await fn(); onChange(); reload(); } catch (e) { setError((e as Error).message); }
  };

  return (
    <div className="card">
      <div className="row between">
        <h3>{st.name}</h3>
        <span className={`badge ${st.online ? "ok" : st.paired ? "bad" : "warn"}`}>
          {st.online ? "● в сети" : st.paired ? "● не в сети" : "◷ ждёт привязки"}
        </span>
      </div>
      {!st.paired && st.pairing_code && (
        <div className="panel">
          <p>На компьютере с принтером выполните:</p>
          <pre className="mono">python hubbro_agent.py pair --server {server} {st.pairing_code}{"\n"}python hubbro_agent.py run</pre>
          <p className="muted">Код действует до {dt(st.pairing_expires_at)}.</p>
        </div>
      )}
      {st.paired && (
        <>
          <p className="muted">ПК: {st.hostname ?? "—"} · агент {st.agent_version ?? "—"} · был в сети {dt(st.last_seen_at)}</p>
          <div className="row gap">
            <label className="field"><span>Принтер</span>
              <select value={printer} onChange={(e) => setPrinter(e.target.value)}>
                <option value="">По умолчанию на ПК</option>
                {st.printers.map((p) => <option key={p} value={p}>{p}{p === st.default_printer ? " (по умолчанию)" : ""}</option>)}
              </select>
            </label>
            <button onClick={() => act(() => api(`/api/stations/${st.id}/test-print`, { body: { printer_name: printer || null } }))}>⎙ Тестовая печать</button>
          </div>
          {jobs && jobs.length > 0 && (
            <table className="mt compact"><tbody>
              {jobs.map((j) => (
                <tr key={j.id}>
                  <td className="muted nowrap">{dt(j.created_at)}</td>
                  <td>{j.kind === "test" ? "Тест" : j.label_code}</td>
                  <td>{j.printer_name ?? "по умолчанию"}</td>
                  <td><span className={`badge ${j.status === "failed" ? "bad" : j.status === "done" ? "ok" : "info"}`}>{JOB_STATUS[j.status]}</span></td>
                  <td className="muted">{j.error}</td>
                </tr>
              ))}
            </tbody></table>
          )}
        </>
      )}
      <div className="row gap mt">
        <button className="ghost small" onClick={() => act(() => api(`/api/stations/${st.id}/pairing-code`, { method: "POST" }))}>Новый код привязки</button>
        <button className="ghost small" onClick={() => confirm(`Удалить станцию «${st.name}»?`) && act(() => api(`/api/stations/${st.id}`, { method: "DELETE" }))}>Удалить</button>
      </div>
      <ErrorLine error={error} />
    </div>
  );
}

export function Stations() {
  const { data, error, reload } = useApi<Station[]>("/api/stations", 3000);
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  return (
    <div>
      <div className="page-head"><h1>Принтеры и станции печати</h1></div>
      <p className="hint">Станция — компьютер, к которому подключён принтер. На нём работает HUB BRO Agent: он сам забирает задания с сервера, открывать порты на роутере не нужно.</p>
      <div className="toolbar">
        <label className="field"><span>Название станции</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Склад, домашний ПК" /></label>
        <button className="primary" disabled={!name.trim()} onClick={async () => {
          try { await api("/api/stations", { body: { name } }); setName(""); reload(); } catch (e) { setErr((e as Error).message); }
        }}>+ Добавить станцию</button>
      </div>
      <ErrorLine error={err ?? error} />
      {data && !data.length && <Empty>Станций пока нет.</Empty>}
      <div className="cards">{data?.map((st) => <StationCard key={st.id} st={st} onChange={reload} />)}</div>
    </div>
  );
}
