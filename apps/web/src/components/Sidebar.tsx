import { Check, Clock3, Copy, Inbox, Plus, Settings, ShieldCheck, Trash2, X } from "lucide-react";
import type { Mailbox } from "@relaybox/shared";
import { Brand } from "./Brand";
import { configuredLifetimeLabel, expiryProgress, formatBytes, lifetimeLabel } from "../utils";
import { BeautifulSelect } from "./BeautifulSelect";

interface Props {
  mailboxes: Mailbox[];
  active?: Mailbox | undefined;
  copied: boolean;
  now: number;
  open: boolean;
  onClose(): void;
  onSelect(address: string): void;
  onCopy(): void;
  onCreate(): void;
  onDelete(): void;
  onSettings(): void;
}

export function Sidebar({ mailboxes, active, copied, now, open, onClose, onSelect, onCopy, onCreate, onDelete, onSettings }: Props) {
  return <aside className={`sidebar ${open ? "is-open" : ""}`}>
    <div className="sidebar-top">
      <Brand />
      <button className="icon-button sidebar-close" onClick={onClose} aria-label="Close sidebar"><X /></button>
    </div>

    {active ? <>
      <div className="eyebrow"><span className="status-dot" /> Active mailbox</div>
      <div className="address-card">
        <div className="address-row">
          <span title={active.address}>{active.alias}<small>@{active.domain}</small></span>
          <button onClick={onCopy} aria-label="Copy email address">{copied ? <Check /> : <Copy />}</button>
        </div>
        <BeautifulSelect className="mailbox-picker" value={active.address} options={mailboxes.map((mailbox) => ({ value: mailbox.address, label: mailbox.address, description: mailbox.expiresAt ? configuredLifetimeLabel(mailbox.createdAt, mailbox.expiresAt) : "Never expires" }))} onChange={onSelect} ariaLabel="Switch mailbox" leadingIcon={<Inbox />} minMenuWidth={250} />
      </div>

      <div className="metric-card">
        <div className="metric-heading"><span><Clock3 /> Expires in</span><strong>{configuredLifetimeLabel(active.createdAt, active.expiresAt)}</strong></div>
        {active.expiresAt ? <>
          <div className="progress"><i style={{ width: `${expiryProgress(active.createdAt, active.expiresAt, now)}%` }} /></div>
          <p>{lifetimeLabel(active.expiresAt, now)}</p>
        </> : <p className="no-expiration">Never expires</p>}
      </div>

      <div className="metric-card storage-card">
        <div className="metric-heading"><span>Storage</span><strong>{Math.round((active.storageUsed / active.storageLimit) * 100)}%</strong></div>
        <div className="progress neutral"><i style={{ width: `${Math.min(100, (active.storageUsed / active.storageLimit) * 100)}%` }} /></div>
        <p>{formatBytes(active.storageUsed)} of {formatBytes(active.storageLimit)}</p>
      </div>

      <button className="danger-ghost" onClick={onDelete}><Trash2 /> Delete mailbox permanently</button>

    </> : <div className="sidebar-empty"><ShieldCheck /><p>No active mailbox</p><span>Create a private address to begin.</span></div>}

    <div className="sidebar-bottom">
      <div className="active-count"><span>{mailboxes.length}</span><p>Active mailboxes<small>Stored on this device</small></p></div>
      <button className="primary wide" onClick={onCreate}><Plus /> Create mailbox</button>
      <button className="settings-button" onClick={onSettings}><Settings /> Settings</button>
      <p className="privacy-note"><ShieldCheck /> Private by design · no tracking</p>
    </div>
  </aside>;
}
