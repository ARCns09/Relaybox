import { Activity, ArrowLeft, Ban, Check, Copy, Database, Gauge, Globe2, HardDrive, KeyRound, Mailbox, Menu, MoreHorizontal, Plus, Search, ShieldCheck, Trash2, UserCheck, Users, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { OneTimeCredentials, PlatformState, PlatformUser } from "../platform";
import { generateTemporaryPassword, platformStorageStats } from "../platform";
import { formatBytes, fullDate } from "../utils";
import { BeautifulSelect } from "./BeautifulSelect";
import { Modal } from "./Modal";

interface Props {
  currentUser: PlatformUser;
  state: PlatformState;
  onChange(state: PlatformState): void;
  onBackToInbox(): void;
  onMenu(): void;
  onToast(message: string, tone?: "success" | "error"): void;
}

type AdminTab = "overview" | "users" | "domains";

export function AdminDashboard({ currentUser, state, onChange, onBackToInbox, onMenu, onToast }: Props) {
  const [tab, setTab] = useState<AdminTab>("overview");
  const [search, setSearch] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [quotaUser, setQuotaUser] = useState<PlatformUser>();
  const [inspectUser, setInspectUser] = useState<PlatformUser>();
  const [credentials, setCredentials] = useState<OneTimeCredentials>();
  const stats = platformStorageStats(state);
  const members = state.users.filter((user) => user.role === "member");
  const visibleUsers = state.users.filter((user) => `${user.displayName ?? ""} ${user.email}`.toLowerCase().includes(search.toLowerCase()));
  const largestUsers = [...state.users].sort((a, b) => b.usedBytes - a.usedBytes).slice(0, 4);

  const updateUser = (id: string, updater: (user: PlatformUser) => PlatformUser) => {
    onChange({ ...state, users: state.users.map((user) => user.id === id ? updater(user) : user) });
  };

  const toggleUser = (user: PlatformUser) => {
    if (user.isProtected) return;
    const status = user.status === "active" ? "disabled" : "active";
    updateUser(user.id, (current) => ({ ...current, status }));
    onToast(`${user.email} is now ${status}.`);
  };

  const removeUser = (user: PlatformUser) => {
    if (user.isProtected || !window.confirm(`Remove ${user.email} from this frontend preview?`)) return;
    onChange({ ...state, users: state.users.filter((candidate) => candidate.id !== user.id) });
    onToast(`${user.email} removed from the preview.`);
  };

  const resetPassword = (user: PlatformUser) => {
    setCredentials({ email: user.email, temporaryPassword: generateTemporaryPassword(), quotaBytes: user.quotaBytes });
  };

  return <section className="admin-workspace">
    <header className="admin-topbar">
      <button className="icon-button admin-menu" onClick={onMenu} aria-label="Open navigation"><Menu /></button>
      <div><span className="eyebrow">Administration</span><h1>{tab === "overview" ? "Service overview" : tab === "users" ? "Users & storage" : "Domain capabilities"}</h1></div>
      <button className="secondary" onClick={onBackToInbox}><ArrowLeft /> Back to inbox</button>
      <button className="primary" onClick={() => setInviteOpen(true)}><Plus /> Invite member</button>
    </header>
    <nav className="admin-tabs" aria-label="Admin sections">
      <button className={tab === "overview" ? "active" : ""} onClick={() => setTab("overview")}><Gauge /> Overview</button>
      <button className={tab === "users" ? "active" : ""} onClick={() => setTab("users")}><Users /> Users <span>{state.users.length}</span></button>
      <button className={tab === "domains" ? "active" : ""} onClick={() => setTab("domains")}><Globe2 /> Domains</button>
    </nav>

    <div className="admin-scroll">
      {tab === "overview" && <>
        <section className="admin-stat-grid">
          <StatCard icon={<HardDrive />} label="Relaybox capacity" value={formatBytes(stats.relayboxCapacityBytes)} detail={`${formatBytes(stats.systemReservedBytes)} system reserve`} tone="purple" />
          <StatCard icon={<Database />} label="Allocated" value={formatBytes(stats.allocatedBytes)} detail={`${Math.round((stats.allocatedBytes / stats.relayboxCapacityBytes) * 100)}% committed`} tone="blue" />
          <StatCard icon={<Activity />} label="Actually used" value={formatBytes(stats.actualUsedBytes)} detail={`${stats.usagePercent.toFixed(1)}% of capacity`} tone="green" />
          <StatCard icon={<Gauge />} label="Unallocated" value={formatBytes(stats.unallocatedBytes)} detail="Available for quotas" tone="amber" />
        </section>
        <section className="storage-overview admin-card">
          <header><div><span className="eyebrow">Storage accounting</span><h2>Relaybox usable storage</h2></div><strong>{stats.usagePercent.toFixed(1)}% actually used</strong></header>
          <div className="storage-stack" aria-label="Storage allocation"><i className="used" style={{ width: `${Math.min(100, stats.usagePercent)}%` }} /><i className="allocated" style={{ width: `${Math.min(100, ((stats.allocatedBytes - stats.actualUsedBytes) / stats.relayboxCapacityBytes) * 100)}%` }} /></div>
          <div className="storage-legend"><span><i className="used" />Used <strong>{formatBytes(stats.actualUsedBytes)}</strong></span><span><i className="allocated" />Allocated headroom <strong>{formatBytes(Math.max(0, stats.allocatedBytes - stats.actualUsedBytes))}</strong></span><span><i />Unallocated <strong>{formatBytes(stats.unallocatedBytes)}</strong></span></div>
        </section>
        <div className="admin-two-column">
          <section className="admin-card practical-metrics"><header><div><span className="eyebrow">Platform</span><h2>Practical totals</h2></div></header>
            <div><Metric icon={<Users />} label="Members" value={String(members.length)} detail={`${members.filter((user) => user.status === "active").length} active · ${members.filter((user) => user.status === "disabled").length} disabled`} />
              <Metric icon={<Mailbox />} label="Mailboxes" value={String(stats.mailboxCount)} detail={`${state.metrics.permanentMailboxes} permanent · ${state.metrics.temporaryMailboxes} temporary`} />
              <Metric icon={<Database />} label="Messages" value={state.metrics.messagesStored.toLocaleString()} detail={`${formatBytes(state.metrics.attachmentBytes)} attachments`} /></div>
          </section>
          <section className="admin-card largest-users"><header><div><span className="eyebrow">Allocation</span><h2>Largest storage users</h2></div><button onClick={() => setTab("users")}>Manage all</button></header>
            <div>{largestUsers.map((user) => <button key={user.id} onClick={() => setInspectUser(user)}><UserBadge user={user} /><span className="user-storage-bar"><i style={{ width: `${Math.min(100, (user.usedBytes / user.quotaBytes) * 100)}%` }} /></span><strong>{formatBytes(user.usedBytes)}</strong></button>)}</div>
          </section>
        </div>
      </>}

      {tab === "users" && <section className="admin-card users-card">
        <header className="users-toolbar"><div><span className="eyebrow">Accounts</span><h2>Invited users</h2></div><label><Search /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search users" /></label><button className="primary" onClick={() => setInviteOpen(true)}><Plus /> Invite</button></header>
        <div className="users-table" role="table"><div className="users-table-head" role="row"><span>User</span><span>Status</span><span>Storage</span><span>Mailboxes</span><span>Last login</span><span>Actions</span></div>
          {visibleUsers.map((user) => <div className="user-table-row" role="row" key={user.id}>
            <UserBadge user={user} />
            <span><StatusBadge status={user.status} /></span>
            <span className="quota-cell"><strong>{formatBytes(user.usedBytes)} <small>of {formatBytes(user.quotaBytes)}</small></strong><i><b style={{ width: `${Math.min(100, (user.usedBytes / user.quotaBytes) * 100)}%` }} /></i></span>
            <span className="mailbox-count">{user.mailboxCount}</span>
            <span className="last-login">{user.lastLoginAt ? fullDate(user.lastLoginAt) : "Never"}</span>
            <span className="user-actions"><button onClick={() => setInspectUser(user)} title="Inspect user"><MoreHorizontal /></button><button onClick={() => setQuotaUser(user)} title="Change quota"><HardDrive /></button><button onClick={() => resetPassword(user)} title="Generate temporary password"><KeyRound /></button><button disabled={user.isProtected} onClick={() => toggleUser(user)} title={user.status === "active" ? "Disable user" : "Enable user"}>{user.status === "active" ? <Ban /> : <UserCheck />}</button><button className="danger" disabled={user.isProtected} onClick={() => removeUser(user)} title="Remove user"><Trash2 /></button></span>
          </div>)}
          {!visibleUsers.length && <div className="admin-empty"><Search /><strong>No matching users</strong><span>Try another name or email.</span></div>}
        </div>
      </section>}

      {tab === "domains" && <section className="domain-grid">{state.domains.map((domain) => <article className={`admin-card domain-card ${domain.visibility}`} key={domain.domain}>
        <header><span className="domain-icon"><Globe2 /></span><StatusBadge status={domain.status === "active" ? "active" : "disabled"} label={domain.status} /></header>
        <h2>{domain.domain}</h2><p>{domain.visibility === "public" ? "Available to invited members when exposed by server capabilities." : "Private administrative domain. Never included in public mailbox selectors."}</p>
        <dl><div><dt>Visibility</dt><dd>{domain.visibility}</dd></div><div><dt>Public creation</dt><dd>{domain.allowMailboxCreation ? "Allowed" : "Blocked"}</dd></div><div><dt>Reserved</dt><dd>{domain.reservedMailboxes.join(", ") || "None"}</dd></div></dl>
      </article>)}</section>}
    </div>

    {inviteOpen && <InviteUserModal state={state} onClose={() => setInviteOpen(false)} onCreated={(user, result) => { onChange({ ...state, users: [...state.users, user] }); setInviteOpen(false); setCredentials(result); }} />}
    {quotaUser && <QuotaModal user={quotaUser} unallocatedBytes={stats.unallocatedBytes} onClose={() => setQuotaUser(undefined)} onSave={(quotaBytes) => { updateUser(quotaUser.id, (user) => ({ ...user, quotaBytes })); setQuotaUser(undefined); onToast(`${quotaUser.email} now has ${formatBytes(quotaBytes)}.`); }} />}
    {inspectUser && <UserDetailsModal user={inspectUser} onClose={() => setInspectUser(undefined)} onEditQuota={() => { setQuotaUser(inspectUser); setInspectUser(undefined); }} />}
    {credentials && <CredentialsModal value={credentials} onClose={() => setCredentials(undefined)} />}
    <span className="admin-current-user" aria-hidden="true">{currentUser.email}</span>
  </section>;
}

function StatCard({ icon, label, value, detail, tone }: { icon: ReactNode; label: string; value: string; detail: string; tone: string }) {
  return <article className={`admin-stat ${tone}`}><span>{icon}</span><div><small>{label}</small><strong>{value}</strong><p>{detail}</p></div></article>;
}

function Metric({ icon, label, value, detail }: { icon: ReactNode; label: string; value: string; detail: string }) {
  return <div className="practical-metric"><span>{icon}</span><p><strong>{label}</strong><small>{detail}</small></p><b>{value}</b></div>;
}

function UserBadge({ user }: { user: PlatformUser }) {
  const initials = (user.displayName ?? user.email).split(/[\s@]+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  return <span className="user-badge"><i>{initials}</i><span><strong>{user.displayName || user.email.split("@")[0]}</strong><small>{user.email}</small></span>{user.role === "admin" && <em><ShieldCheck /> Admin</em>}</span>;
}

function StatusBadge({ status, label }: { status: "active" | "disabled"; label?: string }) {
  return <span className={`account-status ${status}`}><i />{label ?? status}</span>;
}

function InviteUserModal({ state, onClose, onCreated }: { state: PlatformState; onClose(): void; onCreated(user: PlatformUser, credentials: OneTimeCredentials): void }) {
  const [email, setEmail] = useState(""); const [name, setName] = useState(""); const [amount, setAmount] = useState(5); const [unit, setUnit] = useState<"MB" | "GB">("GB"); const [error, setError] = useState("");
  const quotaBytes = amount * (unit === "GB" ? 1024 ** 3 : 1024 ** 2);
  const available = platformStorageStats(state).unallocatedBytes;
  const submit = () => {
    setError(""); const normalized = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(normalized)) { setError("Enter a valid user email address."); return; }
    if (state.users.some((user) => user.email === normalized)) { setError("That user already exists."); return; }
    if (!Number.isFinite(amount) || amount <= 0) { setError("Storage allocation must be greater than zero."); return; }
    if (quotaBytes > available) { setError(`Only ${formatBytes(available)} remains unallocated.`); return; }
    const password = generateTemporaryPassword();
    const user: PlatformUser = { id: `user-${crypto.randomUUID()}`, email: normalized, ...(name.trim() ? { displayName: name.trim() } : {}), role: "member", status: "active", quotaBytes, usedBytes: 0, mailboxCount: 0, createdAt: new Date().toISOString(), mailboxType: "temporary", isProtected: false };
    onCreated(user, { email: normalized, temporaryPassword: password, quotaBytes });
  };
  return <Modal title="Invite a member" subtitle="Create a private account and allocate its storage." onClose={onClose} className="admin-modal"><div className="modal-content invite-form">
    <label><span>Email address</span><input autoFocus type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="member@example.com" /></label>
    <label><span>Display name <small>optional</small></span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Member name" /></label>
    <label><span>Storage allocation</span><div className="quota-input"><input type="number" min="1" value={amount} onChange={(event) => setAmount(Number(event.target.value))} /><BeautifulSelect value={unit} options={[{ value: "MB", label: "MB" }, { value: "GB", label: "GB" }]} onChange={(value) => setUnit(value as "MB" | "GB")} ariaLabel="Storage unit" /></div><small>{formatBytes(available)} currently unallocated</small></label>
    <div className="invite-callout"><KeyRound /><p><strong>A temporary password will be generated once.</strong><span>Relaybox will not email it. Copy and share it through a trusted channel.</span></p></div>{error && <p className="form-error">{error}</p>}
  </div><footer className="modal-actions"><button className="text-button" onClick={onClose}>Cancel</button><button className="primary" onClick={submit}><Plus /> Create invitation</button></footer></Modal>;
}

function QuotaModal({ user, unallocatedBytes, onClose, onSave }: { user: PlatformUser; unallocatedBytes: number; onClose(): void; onSave(value: number): void }) {
  const startsInGb = user.quotaBytes >= 1024 ** 3;
  const [unit, setUnit] = useState<"MB" | "GB">(startsInGb ? "GB" : "MB");
  const [amount, setAmount] = useState(startsInGb ? user.quotaBytes / 1024 ** 3 : user.quotaBytes / 1024 ** 2);
  const quotaBytes = amount * (unit === "GB" ? 1024 ** 3 : 1024 ** 2);
  const belowUsage = quotaBytes < user.usedBytes;
  const exceedsCapacity = quotaBytes > user.quotaBytes + unallocatedBytes;
  return <Modal title="Change storage quota" subtitle={user.email} onClose={onClose} className="admin-modal quota-modal"><div className="modal-content">
    <div className="quota-current"><span>Current allocation<strong>{formatBytes(user.quotaBytes)}</strong></span><span>Actual usage<strong>{formatBytes(user.usedBytes)}</strong></span><span>Unallocated pool<strong>{formatBytes(unallocatedBytes)}</strong></span></div>
    <label className="quota-field"><span>New allocation</span><div className="quota-input"><input autoFocus type="number" min="1" step={unit === "GB" ? ".25" : "1"} value={amount} onChange={(event) => setAmount(Number(event.target.value))} /><BeautifulSelect value={unit} options={[{ value: "MB", label: "MB" }, { value: "GB", label: "GB" }]} onChange={(value) => setUnit(value as "MB" | "GB")} ariaLabel="Quota unit" /></div></label>
    {belowUsage && <p className="quota-warning"><X /> You cannot set this quota below the user’s current {formatBytes(user.usedBytes)} usage.</p>}
    {exceedsCapacity && <p className="quota-warning"><X /> This allocation exceeds the available Relaybox capacity.</p>}
    {!belowUsage && !exceedsCapacity && <p className="quota-success"><Check /> {formatBytes(Math.abs(user.quotaBytes - quotaBytes))} will be {quotaBytes <= user.quotaBytes ? "returned to" : "taken from"} unallocated storage.</p>}
  </div><footer className="modal-actions"><button className="text-button" onClick={onClose}>Cancel</button><button className="primary" disabled={belowUsage || exceedsCapacity || amount <= 0} onClick={() => onSave(quotaBytes)}><HardDrive /> Save quota</button></footer></Modal>;
}

function UserDetailsModal({ user, onClose, onEditQuota }: { user: PlatformUser; onClose(): void; onEditQuota(): void }) {
  return <Modal title="Account summary" subtitle="Frontend preview of future account metadata." onClose={onClose} className="admin-modal"><div className="modal-content user-detail-modal"><UserBadge user={user} /><dl><div><dt>Role</dt><dd>{user.role}</dd></div><div><dt>Status</dt><dd><StatusBadge status={user.status} /></dd></div><div><dt>Storage</dt><dd>{formatBytes(user.usedBytes)} of {formatBytes(user.quotaBytes)}</dd></div><div><dt>Mailboxes</dt><dd>{user.mailboxCount}</dd></div><div><dt>Created</dt><dd>{fullDate(user.createdAt)}</dd></div><div><dt>Last login</dt><dd>{user.lastLoginAt ? fullDate(user.lastLoginAt) : "Never"}</dd></div>{user.primaryMailbox && <div><dt>Primary mailbox</dt><dd>{user.primaryMailbox} {user.isProtected && <em>Protected</em>}</dd></div>}</dl></div><footer className="modal-actions"><button className="text-button" onClick={onClose}>Close</button><button className="primary" onClick={onEditQuota}><HardDrive /> Edit quota</button></footer></Modal>;
}

function CredentialsModal({ value, onClose }: { value: OneTimeCredentials; onClose(): void }) {
  const [copied, setCopied] = useState<"password" | "all">();
  const copy = async (kind: "password" | "all") => { await navigator.clipboard.writeText(kind === "password" ? value.temporaryPassword : `Relaybox login\nEmail: ${value.email}\nTemporary password: ${value.temporaryPassword}\nStorage: ${formatBytes(value.quotaBytes)}`); setCopied(kind); };
  return <Modal title="Save these login details" subtitle="The temporary password is displayed only in this frontend flow." onClose={onClose} className="credentials-modal"><div className="modal-content credentials-content"><div className="credentials-warning"><KeyRound /><p><strong>Copy this password now.</strong><span>Send it to the member through a trusted channel. Email delivery is not implemented here.</span></p></div><dl><div><dt>User email</dt><dd>{value.email}</dd></div><div><dt>Temporary password</dt><dd><code>{value.temporaryPassword}</code><button onClick={() => void copy("password")}><Copy />{copied === "password" ? "Copied" : "Copy"}</button></dd></div><div><dt>Allocated storage</dt><dd>{formatBytes(value.quotaBytes)}</dd></div></dl><button className="secondary copy-login" onClick={() => void copy("all")}><Copy />{copied === "all" ? "Login details copied" : "Copy all login details"}</button></div><footer className="modal-actions"><button className="primary" onClick={onClose}><Check /> Done</button></footer></Modal>;
}
