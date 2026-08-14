import { X } from "lucide-react";
import type { ReactNode } from "react";

export function Modal({ title, subtitle, onClose, children, className = "" }: { title: string; subtitle?: string; onClose(): void; children: ReactNode; className?: string }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className={`modal ${className}`} role="dialog" aria-modal="true" aria-label={title}>
      <header><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="icon-button" onClick={onClose} aria-label="Close"><X /></button></header>
      {children}
    </section>
  </div>;
}
