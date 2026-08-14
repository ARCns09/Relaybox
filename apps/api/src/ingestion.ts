import { randomUUID } from "node:crypto";
import type { InjectEmailInput, MessageSummary } from "@relaybox/shared";
import type { AppConfig } from "./config.js";
import type { MailDatabase } from "./database.js";
import type { AttachmentStorage } from "./storage.js";
import { sanitizeEmailHtml } from "./sanitizer.js";
import { sanitizeFilename } from "./security.js";
import type { RealtimeHub } from "./realtime.js";

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

  async ingest(input: InjectEmailInput): Promise<MessageSummary> {
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
        messageId: `<${randomUUID()}@${this.config.mailDomain}>`,
        senderName: input.senderName?.trim() || input.senderEmail.split("@")[0] || "Unknown sender",
        senderEmail: input.senderEmail.toLowerCase(),
        recipients: [input.to.toLowerCase()],
        subject: input.subject?.trim() || "(No subject)",
        textBody,
        htmlBody,
        receivedAt: new Date().toISOString(),
        size: contentSize,
        attachments: stored,
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
