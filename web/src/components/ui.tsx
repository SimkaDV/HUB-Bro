import { ReactNode, useEffect } from "react";
import { STATUS } from "../format";

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? { text: status, tone: "muted", icon: "●" };
  return <span className={`badge ${s.tone}`}><span aria-hidden>{s.icon}</span> {s.text}</span>;
}

export function Modal({ title, onClose, children, wide }: { title: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const on = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className={`modal ${wide ? "wide" : ""}`} onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="ghost" onClick={onClose} aria-label="Закрыть">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ErrorLine({ error }: { error: string | null }) {
  return error ? <div className="error-line" role="alert">{error}</div> : null;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}
