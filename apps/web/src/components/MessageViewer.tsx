import { AlertCircle, ArrowLeft, CheckCheck, ChevronDown, Clock3, Download, FileText, ImageOff, MailOpen, Printer, RotateCcw, Send, ShieldCheck, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import DOMPurify from "dompurify";
import type { Mailbox, Message } from "@relaybox/shared";
import { SenderAvatar } from "./Brand";
import { formatBytes, fullDate } from "../utils";

interface ReplyDraft { to: string; subject: string; textBody: string; replyToMessageId: string }

interface Props {
  thread: Message[];
  selectedId?: string | undefined;
  mailbox?: Mailbox | undefined;
  loading: boolean;
  defaultHtml: boolean;
  blockRemoteImages: boolean;
  expired: boolean;
  outboundConfigured: boolean;
  onBack(): void;
  onDelete(): void;
  onSend(input: ReplyDraft): Promise<void>;
  onRetry(message: Message): Promise<void>;
  onDownload(id: string, filename: string): void;
}

export function MessageViewer({ thread, selectedId, mailbox, loading, defaultHtml, blockRemoteImages, expired, outboundConfigured, onBack, onDelete, onSend, onRetry, onDownload }: Props) {
  const [view, setView] = useState<"html" | "text">(defaultHtml ? "html" : "text");
  const [body, setBody] = useState("");
  const [subjectDraft, setSubjectDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const selected = thread.find((message) => message.id === selectedId) ?? thread[0];
  const replyTarget = [...thread].reverse().find((message) => message.direction === "incoming");
  const to = replyTarget?.replyTo[0] ?? replyTarget?.senderEmail ?? "";
  const defaultSubject = replyTarget ? (/^re:/i.test(replyTarget.subject) ? replyTarget.subject : `Re: ${replyTarget.subject}`) : "";
  const htmlAvailable = thread.some((message) => Boolean(message.htmlBody));

  useEffect(() => setView(defaultHtml ? "html" : "text"), [selected?.threadId, defaultHtml]);
  useEffect(() => setSubjectDraft(defaultSubject), [defaultSubject, selected?.threadId]);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [thread.length]);

  const submit = async () => {
    if (!replyTarget || !body.trim() || busy || expired || !outboundConfigured) return;
    setBusy(true);
    try {
      await onSend({ to, subject: subjectDraft.trim() || defaultSubject, textBody: body.trim(), replyToMessageId: replyTarget.id });
      setBody("");
    } catch { /* The parent keeps the failed bubble and presents the API error. */ }
    finally { setBusy(false); }
  };

  if (loading) return <section className="viewer-panel"><div className="viewer-loading"><span /><span /><span /></div></section>;
  if (!selected) return <section className="viewer-panel viewer-blank">
    <div className="blank-art"><span><MailOpen /></span><i /><i /></div>
    <h2>Select a conversation</h2><p>Choose an email to open its full thread.</p>
    <small><ShieldCheck /> Scripts and trackers are blocked</small>
  </section>;

  return <section className="viewer-panel conversation-panel">
    <header className="viewer-toolbar conversation-toolbar">
      <button className="icon-button back-button" onClick={onBack} aria-label="Back to inbox"><ArrowLeft /></button>
      <div className="conversation-heading"><span>Conversation</span><strong>{selected.subject}</strong><small>{thread.length} message{thread.length === 1 ? "" : "s"}</small></div>
      <div className="view-toggle" role="group" aria-label="Message format">
        <button className={view === "html" ? "active" : ""} disabled={!htmlAvailable} onClick={() => setView("html")}>HTML</button>
        <button className={view === "text" ? "active" : ""} onClick={() => setView("text")}>Text</button>
      </div>
      <button className="icon-button" onClick={() => window.print()} aria-label="Print conversation"><Printer /></button>
      <button className="icon-button delete-message-button" disabled={expired} onClick={onDelete} aria-label="Delete selected message"><Trash2 /></button>
    </header>

    <div className="conversation-scroll" ref={scrollRef}>
      <div className="thread-day"><span>{fullDate(thread[0]!.receivedAt)}</span></div>
      <div className="thread-list">
        {thread.map((message) => <EmailBubble key={message.id} message={message} mailbox={mailbox} view={view} disabled={expired}
          blockRemoteImages={blockRemoteImages} onDownload={onDownload} onRetry={onRetry} />)}
      </div>
    </div>

    <section className={`inline-compose ${expired || !outboundConfigured ? "disabled" : ""}`}>
      {expired ? <div className="compose-warning"><AlertCircle /> This mailbox has expired. Replies are disabled.</div>
        : !outboundConfigured ? <div className="compose-warning"><AlertCircle /> Outbound email is not configured.</div> : null}
      <div className="compose-envelope">
        <label><span>To</span><input value={to} readOnly aria-label="Reply recipient" /></label>
        <label><span>Subject</span><input value={subjectDraft} disabled={expired || !outboundConfigured || busy} onChange={(event) => setSubjectDraft(event.target.value)} aria-label="Reply subject" /></label>
      </div>
      <textarea value={body} disabled={expired || !outboundConfigured || busy} onChange={(event) => setBody(event.target.value)}
        placeholder={expired ? "This conversation is read-only" : `Reply to ${replyTarget?.senderName ?? "sender"}…`} aria-label="Reply message" />
      <footer>
        <span><ShieldCheck /> One-to-one reply · privacy protected</span>
        <small>{body.length.toLocaleString()} characters</small>
        <button className="primary" disabled={!body.trim() || busy || expired || !outboundConfigured} onClick={() => void submit()}>
          {busy ? <Clock3 className="spin" /> : <Send />} {busy ? "Sending…" : "Send reply"}
        </button>
      </footer>
    </section>
  </section>;
}

function EmailBubble({ message, mailbox, view, blockRemoteImages, disabled, onDownload, onRetry }: {
  message: Message; mailbox?: Mailbox | undefined; view: "html" | "text"; blockRemoteImages: boolean;
  disabled: boolean; onDownload(id: string, filename: string): void; onRetry(message: Message): Promise<void>;
}) {
  const [loadRemote, setLoadRemote] = useState(false);
  const outgoing = message.direction === "outgoing";
  const safeHtml = useMemo(() => {
    if (!message.htmlBody) return "";
    const sanitized = DOMPurify.sanitize(message.htmlBody, { USE_PROFILES: { html: true }, ADD_ATTR: ["data-remote-src"] });
    if (!loadRemote && blockRemoteImages) return sanitized;
    const document = new DOMParser().parseFromString(sanitized, "text/html");
    document.querySelectorAll<HTMLImageElement>("img[data-remote-src]").forEach((image) => {
      const remote = image.dataset.remoteSrc ?? "";
      if (/^https?:\/\//i.test(remote)) image.src = remote;
    });
    return document.body.innerHTML;
  }, [blockRemoteImages, loadRemote, message.htmlBody]);
  const hasRemote = message.htmlBody?.includes("data-remote-src") ?? false;
  return <article className={`chat-row ${outgoing ? "outgoing" : "incoming"}`}>
    {!outgoing && <SenderAvatar logo={message.logo} name={message.senderName} size="small" />}
    <div className="chat-column">
      <div className="bubble-author"><strong>{outgoing ? mailbox?.alias ?? "You" : message.senderName}</strong><time>{fullDate(message.receivedAt)}</time></div>
      <div className={`chat-bubble ${message.deliveryStatus}`}>
        {hasRemote && blockRemoteImages && !loadRemote && <div className="bubble-remote"><ImageOff /><span>Remote images blocked</span><button onClick={() => setLoadRemote(true)}>Load</button></div>}
        {view === "html" && message.htmlBody
          ? <iframe title={`Email from ${message.senderName}`} sandbox="" srcDoc={`<!doctype html><html><head><meta name="referrer" content="no-referrer"><base target="_blank"><style>body{font-family:Arial,sans-serif;line-height:1.55;color:#24232a;padding:16px;margin:0;overflow-wrap:anywhere}img{max-width:100%;height:auto}a{color:#6246ea}table{max-width:100%}</style></head><body>${safeHtml}</body></html>`} />
          : <pre>{message.textBody || "No plain-text version was included."}</pre>}
        {message.attachments.length > 0 && <div className="bubble-attachments">{message.attachments.map((attachment) => <button key={attachment.id} disabled={disabled} onClick={() => onDownload(attachment.id, attachment.filename)}>
          <FileText /><span><strong>{attachment.filename}</strong><small>{formatBytes(attachment.size)}</small></span><Download />
        </button>)}</div>}
        <details className="email-details"><summary><ChevronDown /> Email details</summary><dl>
          <div><dt>From</dt><dd>{message.senderEmail}</dd></div><div><dt>To</dt><dd>{message.recipients.join(", ")}</dd></div>
          {message.cc.length > 0 && <div><dt>CC</dt><dd>{message.cc.join(", ")}</dd></div>}
          <div><dt>Subject</dt><dd>{message.subject}</dd></div><div><dt>Date</dt><dd>{fullDate(message.receivedAt)}</dd></div>
          {mailbox && <div><dt>Mailbox</dt><dd>{mailbox.address}</dd></div>}
        </dl></details>
      </div>
      {outgoing && <div className={`delivery-state ${message.deliveryStatus}`}>
        {message.deliveryStatus === "sending" ? <><Clock3 /> Sending</> : message.deliveryStatus === "failed" ? <><AlertCircle /> Failed <button disabled={disabled} onClick={() => void onRetry(message)}><RotateCcw /> Retry</button></> : <><CheckCheck /> Sent</>}
      </div>}
    </div>
    {outgoing && <SenderAvatar logo={message.logo} name={mailbox?.alias ?? "You"} size="small" />}
  </article>;
}
