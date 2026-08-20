import { ArrowDownUp, Inbox, Menu, Paperclip, Plus, RefreshCw, Search, Sparkles } from "lucide-react";
import type { MessageSummary } from "@relaybox/shared";
import { SenderAvatar } from "./Brand";
import { formatBytes, relativeTime } from "../utils";
import { BeautifulSelect } from "./BeautifulSelect";

interface Props {
  messages: MessageSummary[];
  selectedId?: string | undefined;
  search: string;
  sort: "newest" | "oldest" | "sender";
  loading: boolean;
  mailboxStatus: "none" | "active" | "expired";
  development: boolean;
  onMenu(): void;
  onSearch(value: string): void;
  onSort(value: "newest" | "oldest" | "sender"): void;
  onRefresh(): void;
  onSelect(id: string): void;
  onCreate(): void;
  onDemo(): void;
}

export function InboxPanel(props: Props) {
  const filtered = props.messages.filter((message) => `${message.senderName} ${message.senderEmail} ${message.subject} ${message.preview}`.toLowerCase().includes(props.search.toLowerCase()));
  const sorted = [...filtered].sort((a, b) => props.sort === "sender"
    ? a.senderName.localeCompare(b.senderName)
    : (new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime()) * (props.sort === "newest" ? -1 : 1));
  return <section className="inbox-panel">
    <header className="panel-header inbox-header">
      <button className="icon-button menu-button" onClick={props.onMenu} aria-label="Open sidebar"><Menu /></button>
      <div><span className="eyebrow">Your messages</span><h1>Inbox <em>{props.messages.filter((message) => !message.isRead).length}</em></h1></div>
      <button className={`icon-button ${props.loading ? "spinning" : ""}`} onClick={props.onRefresh} disabled={props.mailboxStatus !== "active"} aria-label="Refresh inbox"><RefreshCw /></button>
    </header>
    <div className="inbox-tools">
      <label className="search-box"><Search /><input disabled={props.mailboxStatus !== "active"} value={props.search} onChange={(event) => props.onSearch(event.target.value)} placeholder="Search mail" /></label>
      <BeautifulSelect disabled={props.mailboxStatus !== "active"} className="sort-select" value={props.sort} options={[{ value: "newest", label: "Newest" }, { value: "oldest", label: "Oldest" }, { value: "sender", label: "Sender" }]} onChange={(value) => props.onSort(value as Props["sort"])} ariaLabel="Sort messages" leadingIcon={<ArrowDownUp />} minMenuWidth={145} />
    </div>
    <div className="message-list">
      {props.mailboxStatus === "none" ? <Empty icon={<Plus />} title="Create your first mailbox" copy="Pick a private address and lifetime for your account." action="Create mailbox" onAction={props.onCreate} />
        : props.mailboxStatus === "expired" ? <Empty icon={<Inbox />} title="This mailbox has expired" copy="Message access has stopped. You can remove it from the sidebar while cleanup finishes." onAction={props.onCreate} />
        : !props.loading && !sorted.length ? <Empty icon={<Inbox />} title={props.search ? "No matching mail" : "Your inbox is ready"} copy={props.search ? "Try a different sender or subject." : "New messages will appear here instantly."} action={props.development && !props.search ? "Send a test message" : undefined} onAction={props.onDemo} />
        : sorted.map((message) => <button key={message.id} className={`message-row ${message.id === props.selectedId ? "selected" : ""} ${!message.isRead ? "unread" : ""}`} onClick={() => props.onSelect(message.id)}>
          <SenderAvatar logo={message.logo} name={message.senderName} />
          <span className="message-copy">
            <span className="message-line"><strong>{message.senderName}</strong><time>{relativeTime(message.receivedAt)}</time></span>
            <span className="message-subject">{message.subject}</span>
            <span className="message-preview">{message.preview || "No message preview"}</span>
            <span className="message-meta">{message.hasAttachments && <><Paperclip /> Attachment · </>}{formatBytes(message.size)}</span>
          </span>
          {!message.isRead && <i className="unread-dot" />}
        </button>)}
    </div>
  </section>;
}

function Empty({ icon, title, copy, action, onAction }: { icon: React.ReactNode; title: string; copy: string; action?: string | undefined; onAction(): void }) {
  return <div className="empty-state"><span>{icon}</span><h2>{title}</h2><p>{copy}</p>{action && <button className="secondary" onClick={onAction}><Sparkles /> {action}</button>}</div>;
}
