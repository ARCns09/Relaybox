import { Check, Clock3, Copy, Globe2, Inbox, LayoutDashboard, LogOut, Mail, Plus, Settings, ShieldCheck, Trash2, X } from "lucide-react";
import type { Mailbox } from "@relaybox/shared";
import type { PlatformUser } from "../platform";
import { Brand } from "./Brand";
import { configuredLifetimeLabel, expiryProgress, formatBytes, isMailboxExpired, lifetimeLabel } from "../utils";
import { BeautifulSelect } from "./BeautifulSelect";

interface Props {
  mailboxes: Mailbox[];
  active?: Mailbox | undefined;
  copied: boolean;
  now: number;
  open: boolean;
  user?: PlatformUser;
  view?: "mail" | "domains" | "admin";
  onClose(): void;
  onSelect(address: string): void;
  onCopy(): void;
  onCreate(): void;
  onDelete(): void;
  onSettings(): void;
  onMail?(): void;
  onAdmin?(): void;
  onDomains?(): void;
  onLogout?(): void;
}

export function Sidebar({ mailboxes, active, copied, now, open, user, view = "mail", onClose, onSelect, onCopy, onCreate, onDelete, onSettings, onMail, onAdmin, onDomains, onLogout }: Props) {
  const expired = active ? isMailboxExpired(active, now) : false;
  const activeCount = mailboxes.filter((mailbox) => !isMailboxExpired(mailbox, now)).length;
  return <aside className={`sidebar ${open ? "is-open" : ""}`}>
    <div className="sidebar-top">
      <Brand />
      <button className="icon-button sidebar-close" onClick={onClose} aria-label="Close sidebar"><X /></button>
    </div>

    {active ? <>
      <div className={`eyebrow ${expired ? "expired-status" : ""}`}><span className={`status-dot ${expired ? "expired" : ""}`} /> {expired ? "Expired mailbox" : "Active mailbox"}</div>
      <div className="address-card">
        <div className="address-row">
          <span title={active.address}>{active.alias}<small>@{active.domain}</small></span>
          <button onClick={onCopy} disabled={expired} aria-label="Copy email address">{copied ? <Check /> : <Copy />}</button>
        </div>
        <BeautifulSelect className="mailbox-picker" value={active.address} options={mailboxes.map((mailbox) => ({ value: mailbox.address, label: mailbox.address, description: isMailboxExpired(mailbox, now) ? "Expired" : mailbox.expiresAt ? configuredLifetimeLabel(mailbox.createdAt, mailbox.expiresAt) : "Never expires" }))} onChange={onSelect} ariaLabel="Switch mailbox" leadingIcon={<Inbox />} minMenuWidth={250} />
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

      <button className="danger-ghost" onClick={onDelete}><Trash2 /> {expired ? "Remove expired mailbox" : "Delete mailbox permanently"}</button>

    </> : <div className="sidebar-empty"><ShieldCheck /><p>No active mailbox</p><span>Create a private address to begin.</span></div>}

    <div className="sidebar-bottom">
      <div className="active-count"><span>{activeCount}</span><p>Active mailboxes<small>{mailboxes.length - activeCount ? `${mailboxes.length - activeCount} expired · ` : ""}Stored on this device</small></p></div>
      <button className="primary wide" onClick={onCreate}><Plus /> Create mailbox</button>
      {user && <>
        <nav className="account-navigation" aria-label="Account navigation">
          <button className={view === "mail" ? "active" : ""} onClick={onMail}><Mail /> Mail</button>
          {user.role === "member" && <button className={view === "domains" ? "active" : ""} onClick={onDomains}><Globe2 /> Domains</button>}
          {user.role === "admin" && <button className={view === "admin" ? "active" : ""} onClick={onAdmin}><LayoutDashboard /> Admin</button>}
          <button onClick={onSettings}><Settings /> Settings</button>
        </nav>
        {user.mailboxType === "admin" && user.primaryMailbox && <div className="primary-mailbox-note"><ShieldCheck /><span><strong>Protected mailbox</strong><small>{user.primaryMailbox}</small></span></div>}
        <div className="account-card"><span className="account-avatar">{accountInitials(user)}</span><span><strong>{user.displayName || user.email.split("@")[0]}</strong><small>{user.email}</small></span><em>{user.role}</em><button onClick={onLogout} title="Sign out" aria-label="Sign out"><LogOut /></button></div>
      </>}
      {!user && <button className="settings-button" onClick={onSettings}><Settings /> Settings</button>}
      <p className="privacy-note"><ShieldCheck /> Private by invitation · no tracking</p>
    </div>
  </aside>;
}

function accountInitials(user: PlatformUser): string {
  return (user.displayName || user.email).split(/[\s@]+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}
