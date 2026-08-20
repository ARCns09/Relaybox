import { ArrowLeft, CheckCircle2, Clock3, Globe2, Menu, ShieldCheck, XCircle } from "lucide-react";
import type { ReactNode } from "react";
import type { DomainCapability, DomainStatus } from "../platform";

interface Props {
  domains: DomainCapability[];
  onBackToInbox(): void;
  onMenu(): void;
}

export function DomainDirectory({ domains, onBackToInbox, onMenu }: Props) {
  const visibleDomains = domains.filter((domain) => domain.visibility === "public");
  return <section className="admin-workspace domain-directory">
    <header className="admin-topbar">
      <button className="icon-button admin-menu" onClick={onMenu} aria-label="Open navigation"><Menu /></button>
      <div><span className="eyebrow">Mailbox network</span><h1>Available domains</h1><p>See which Relaybox addresses are ready now and what is coming next.</p></div>
      <button className="secondary" onClick={onBackToInbox}><ArrowLeft /> Back to inbox</button>
    </header>
    <div className="admin-scroll">
      <div className="domain-summary">
        <DomainSummary status="active" count={visibleDomains.filter((domain) => domain.status === "active").length} />
        <DomainSummary status="upcoming" count={visibleDomains.filter((domain) => domain.status === "upcoming").length} />
        <DomainSummary status="disabled" count={visibleDomains.filter((domain) => domain.status === "disabled").length} />
      </div>
      <section className="domain-grid member-domain-grid">
        {visibleDomains.map((domain) => <DomainCard key={domain.domain} domain={domain} />)}
        {!visibleDomains.length && <div className="admin-card domain-empty"><Globe2 /><h2>No public domains yet</h2><p>Your administrator has not published a mailbox domain.</p></div>}
      </section>
      <div className="domain-help"><ShieldCheck /><p><strong>Domains are managed by your Relaybox administrator.</strong><span>Only active domains with mailbox creation enabled appear in the Create mailbox selector.</span></p></div>
    </div>
  </section>;
}

export function DomainCard({ domain, actions }: { domain: DomainCapability; actions?: ReactNode }) {
  return <article className={`admin-card domain-card ${domain.visibility} status-${domain.status}`}>
    <header><span className="domain-icon"><Globe2 /></span><DomainStatusBadge status={domain.status} /></header>
    <h2>{domain.domain}</h2>
    <p>{domain.visibility === "public" ? domain.status === "active" ? "Ready for mailbox creation by invited members." : domain.status === "upcoming" ? "Configured for a future launch, but not available for mailbox creation yet." : "Temporarily unavailable for new mailbox creation." : "Private administrative domain. Never included in public mailbox selectors."}</p>
    <dl><div><dt>Visibility</dt><dd>{domain.visibility}</dd></div><div><dt>Mailbox creation</dt><dd>{domain.status === "active" && domain.allowMailboxCreation ? "Available" : "Unavailable"}</dd></div>{domain.visibility === "reserved" && <div><dt>Reserved</dt><dd>{domain.reservedMailboxes.join(", ") || "Protected"}</dd></div>}</dl>
    {actions && <footer className="domain-actions">{actions}</footer>}
  </article>;
}

export function DomainStatusBadge({ status }: { status: DomainStatus }) {
  const Icon = status === "active" ? CheckCircle2 : status === "upcoming" ? Clock3 : XCircle;
  return <span className={`domain-status ${status}`}><Icon />{status}</span>;
}

function DomainSummary({ status, count }: { status: DomainStatus; count: number }) {
  return <div className={`domain-summary-item ${status}`}><span>{count}</span><p><strong>{status}</strong><small>{status === "active" ? "Ready to use" : status === "upcoming" ? "Coming soon" : "Not available"}</small></p></div>;
}
