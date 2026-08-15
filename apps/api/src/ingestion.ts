import { randomUUID } from "node:crypto";
import type { InjectEmailInput, MessageSummary } from "@relaybox/shared";
import type { AppConfig } from "./config.js";
import type { MailDatabase } from "./database.js";
import type { AttachmentStorage } from "./storage.js";
import { sanitizeEmailHtml } from "./sanitizer.js";
import { sanitizeFilename } from "./security.js";
import type { RealtimeHub } from "./realtime.js";

export interface NormalizedEmailInput extends InjectEmailInput {
  recipients?: string[];
  cc?: string[];
  replyTo?: string[];
  headers?: Record<string, string>;
  messageId?: string;
  receivedAt?: string;
  provider?: { name: string; messageId: string };
}

const blockedMimes = new Set([
  "application/x-msdownload", "application/x-executable", "application/x-sh", "application/x-bat", "text/x-shellscript",
]);

export class IngestionService {
  constructor(
    private readonly config: AppConfig,
    private readonly db: MailDatabase,
    private readonly storage: AttachmentStorage,
    private readonly realtime: RealtimeHub,
  ) {}

  async ingest(input: NormalizedEmailInput): Promise<MessageSummary> {
    if (input.provider && this.db.providerMessageHandled(input.provider.name, input.provider.messageId)) {
      throw new IngestionError(409, "Provider message was already handled.");
    }
    const mailboxRow = this.db.getMailboxRow(input.to.toLowerCase());
    if (!mailboxRow) throw new IngestionError(404, "Recipient mailbox does not exist.");
    if (!mailboxRow.is_active || (mailboxRow.expires_at && new Date(mailboxRow.expires_at) <= new Date())) {
      throw new IngestionError(410, "Recipient mailbox has expired.");
    }
    if (!/^\S+@\S+\.\S+$/.test(input.senderEmail)) throw new IngestionError(400, "A valid senderEmail is required.");
    const encodedAttachments = input.attachments ?? [];
    const decoded = encodedAttachments.map((item) => ({
      filename: sanitizeFilename(item.filename),
      mimeType: item.mimeType?.toLowerCase() || "application/octet-stream",
      content: Buffer.from(item.contentBase64, "base64"),
    }));
    for (const attachment of decoded) {
      if (attachment.content.byteLength > this.config.maxAttachmentBytes) throw new IngestionError(413, `Attachment ${attachment.filename} is too large.`);
      if (blockedMimes.has(attachment.mimeType)) throw new IngestionError(415, `Attachment type ${attachment.mimeType} is not allowed.`);
    }
    const htmlBody = input.htmlBody ? sanitizeEmailHtml(input.htmlBody, this.config.blockRemoteImages) : null;
    const textBody = input.textBody ?? "";
    const receivedAt = input.receivedAt && Number.isFinite(new Date(input.receivedAt).getTime()) ? new Date(input.receivedAt).toISOString() : new Date().toISOString();
    const recipients = [...new Set([...(input.recipients ?? []), input.to].map((address) => address.toLowerCase()))];
    const headers = Object.fromEntries(Object.entries(input.headers ?? {}).map(([key, value]) => [key.toLowerCase().slice(0, 160), String(value).slice(0, 8192)]));
    const contentSize = Buffer.byteLength(textBody) + Buffer.byteLength(htmlBody ?? "") + decoded.reduce((total, item) => total + item.content.byteLength, 0);
    if (contentSize > this.config.maxMessageBytes) throw new IngestionError(413, "Message is too large.");
    if (mailboxRow.storage_used + contentSize > this.config.storageLimitBytes) throw new IngestionError(413, "Mailbox storage quota exceeded.");

    const stored: Array<{ filename: string; mimeType: string; size: number; storagePath: string }> = [];
    try {
      for (const attachment of decoded) {
        const result = await this.storage.put(attachment.content);
        stored.push({ filename: attachment.filename, mimeType: attachment.mimeType, size: result.size, storagePath: result.storagePath });
      }
      const message = this.db.insertMessage({
        mailboxId: mailboxRow.id,
        messageId: input.messageId?.trim() || `<${randomUUID()}@${this.config.mailDomain}>`,
        senderName: input.senderName?.trim() || input.senderEmail.split("@")[0] || "Unknown sender",
        senderEmail: input.senderEmail.toLowerCase(),
        recipients,
        cc: (input.cc ?? []).map((address) => address.toLowerCase()),
        replyTo: (input.replyTo ?? []).map((address) => address.toLowerCase()),
        headers,
        threadId: this.db.resolveThreadId(mailboxRow.id, input.subject?.trim() || "(No subject)", input.senderEmail, headers),
        subject: input.subject?.trim() || "(No subject)",
        textBody,
        htmlBody,
        receivedAt,
        size: contentSize,
        attachments: stored,
        ...(input.provider ? { provider: input.provider } : {}),
      });
      this.realtime.publish(mailboxRow.id, { type: "message:new", message });
      return message;
    } catch (error) {
      await Promise.all(stored.map((entry) => this.storage.delete(entry.storagePath)));
      throw error;
    }
  }
}

export class IngestionError extends Error {
  constructor(readonly statusCode: number, message: string) { super(message); }
}
