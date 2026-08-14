import { ArrowLeft, Download, ExternalLink, FileText, ImageOff, MailOpen, Paperclip, Printer, Reply, ShieldCheck, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import DOMPurify from "dompurify";
import type { Message } from "@relaybox/shared";
import { SenderAvatar } from "./Brand";
import { formatBytes, fullDate } from "../utils";

interface Props {
  message?: Message | undefined;
  loading: boolean;
  defaultHtml: boolean;
  blockRemoteImages: boolean;
  onBack(): void;
  onReply(): void;
  onDelete(): void;
  onDownload(id: string, filename: string): void;
}

export function MessageViewer({ message, loading, defaultHtml, blockRemoteImages, onBack, onReply, onDelete, onDownload }: Props) {
  const [view, setView] = useState<"html" | "text">(defaultHtml ? "html" : "text");
  const [loadRemote, setLoadRemote] = useState(false);
  const frameRef = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    setLoadRemote(false);
    setView(defaultHtml ? "html" : "text");
  }, [message?.id, defaultHtml]);
  const safeHtml = useMemo(() => {
    if (!message?.htmlBody) return "";
    const sanitized = DOMPurify.sanitize(message.htmlBody, { USE_PROFILES: { html: true }, ADD_ATTR: ["data-remote-src"] });
    if (!loadRemote && blockRemoteImages) return sanitized;
    const document = new DOMParser().parseFromString(sanitized, "text/html");
    document.querySelectorAll<HTMLImageElement>("img[data-remote-src]").forEach((image) => {
      const remote = image.dataset.remoteSrc ?? "";
      if (/^https?:\/\//i.test(remote)) image.src = remote;
    });
    return document.body.innerHTML;
  }, [message?.htmlBody, loadRemote, blockRemoteImages]);
  const hasRemote = message?.htmlBody?.includes("data-remote-src") ?? false;

  if (loading) return <section className="viewer-panel"><div className="viewer-loading"><span /><span /><span /></div></section>;
  if (!message) return <section className="viewer-panel viewer-blank">
    <div className="blank-art"><span><MailOpen /></span><i /><i /></div>
    <h2>Select a message</h2><p>Choose an email from your inbox to read it here.</p>
    <small><ShieldCheck /> Scripts and trackers are blocked</small>
  </section>;

  const htmlAvailable = Boolean(message.htmlBody);
  return <section className="viewer-panel has-message">
    <header className="viewer-toolbar">
      <button className="icon-button back-button" onClick={onBack} aria-label="Back to inbox"><ArrowLeft /></button>
      <div className="view-toggle" role="group" aria-label="Message format">
        <button className={view === "html" ? "active" : ""} disabled={!htmlAvailable} onClick={() => setView("html")}>HTML</button>
        <button className={view === "text" ? "active" : ""} onClick={() => setView("text")}>Text</button>
      </div>
      <span className="toolbar-spacer" />
      <button className="icon-button" onClick={() => frameRef.current?.contentWindow?.print()} aria-label="Print"><Printer /></button>
      <button className="icon-button delete-message-button" onClick={onDelete} aria-label="Delete message" title="Delete message"><Trash2 /></button>
    </header>
    <article className="message-view">
      <div className="message-title-row">
        <div><span className="eyebrow">Message</span><h1>{message.subject}</h1></div>
        <button className="secondary reply-top" onClick={onReply}><Reply /> Reply</button>
      </div>
      <div className="sender-detail">
        <SenderAvatar logo={message.logo} name={message.senderName} size="large" />
        <div><strong>{message.senderName}</strong><span>{message.senderEmail}</span><small>to {message.recipients.join(", ")}</small></div>
        <time title={fullDate(message.receivedAt)}>{fullDate(message.receivedAt)}</time>
      </div>
      {hasRemote && blockRemoteImages && !loadRemote && <div className="remote-banner"><ImageOff /><span><strong>Remote images blocked</strong><small>Protecting your IP address and activity.</small></span><button onClick={() => setLoadRemote(true)}>Load remote content</button></div>}
      <div className={`email-body ${view}`}>
        {view === "html" && htmlAvailable
          ? <iframe ref={frameRef} title="Email content" sandbox="" srcDoc={`<!doctype html><html><head><meta name="referrer" content="no-referrer"><base target="_blank"><style>body{font-family:Arial,sans-serif;line-height:1.6;color:#24232a;padding:24px;overflow-wrap:anywhere}img{max-width:100%;height:auto}a{color:#6246ea}table{max-width:100%}</style></head><body>${safeHtml}</body></html>`} />
          : <pre>{message.textBody || "No plain-text version was included with this message."}</pre>}
      </div>
      {message.attachments.length > 0 && <section className="attachments">
        <h3><Paperclip /> {message.attachments.length} attachment{message.attachments.length === 1 ? "" : "s"}</h3>
        <div>{message.attachments.map((attachment) => <button key={attachment.id} onClick={() => onDownload(attachment.id, attachment.filename)}>
          <span><FileText /></span><p><strong>{attachment.filename}</strong><small>{attachment.mimeType} · {formatBytes(attachment.size)}</small></p><Download />
        </button>)}</div>
      </section>}
      <div className="message-footer-actions"><button className="primary" onClick={onReply}><Reply /> Reply to {message.senderName}</button><a href={`mailto:${message.senderEmail}`}><ExternalLink /> Open in mail app</a></div>
    </article>
  </section>;
}
