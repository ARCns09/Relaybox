import { Loader2, Reply, Send } from "lucide-react";
import { useState } from "react";
import type { Message } from "@relaybox/shared";
import { Modal } from "./Modal";

export function ReplyModal({ message, from, onClose, onSend }: { message: Message; from: string; onClose(): void; onSend(input: { to: string; subject: string; textBody: string }): Promise<void> }) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const subject = message.subject.toLowerCase().startsWith("re:") ? message.subject : `Re: ${message.subject}`;
  const submit = async () => {
    setBusy(true);
    try { await onSend({ to: message.senderEmail, subject, textBody: body }); }
    finally { setBusy(false); }
  };
  return <Modal title="Reply to message" subtitle={`Sending privately from ${from}`} onClose={onClose} className="reply-modal">
    <div className="modal-content compose-fields">
      <label><span>To</span><input value={message.senderEmail} readOnly /></label>
      <label><span>Subject</span><input value={subject} readOnly /></label>
      <label className="compose-body"><span>Message</span><textarea autoFocus value={body} onChange={(event) => setBody(event.target.value)} placeholder={`Write a reply to ${message.senderName}…`} /></label>
      <p><Reply /> Replies are strictly one-to-one. Your SMTP credentials never reach this browser.</p>
    </div>
    <footer className="modal-actions"><button className="text-button" onClick={onClose}>Cancel</button><button className="primary" disabled={busy || !body.trim()} onClick={submit}>{busy ? <Loader2 className="spin" /> : <Send />} Send reply</button></footer>
  </Modal>;
}
