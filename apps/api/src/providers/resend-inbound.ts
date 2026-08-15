import type { AppConfig } from "../config.js";
import type { MailDatabase } from "../database.js";
import { IngestionError, type IngestionService } from "../ingestion.js";
import type { ResendInboundClient } from "./resend-client.js";

export interface ResendSyncResult { checked: number; imported: number; skipped: number; failed: number }
export interface ProviderLogger { info(message: string): void; warn(message: string): void }
export type AttachmentDownloader = (url: string, maximumBytes: number) => Promise<Buffer>;

export class ResendInboundAdapter {
  private timer: NodeJS.Timeout | undefined;
  private activeSync: Promise<ResendSyncResult> | undefined;

  constructor(
    private readonly config: AppConfig,
    private readonly client: ResendInboundClient,
    private readonly db: MailDatabase,
    private readonly ingestion: IngestionService,
    private readonly logger: ProviderLogger,
    private readonly download: AttachmentDownloader = downloadAttachment,
  ) {}

  start(): void {
    if (this.timer || !this.config.resendInboundEnabled) return;
    void this.sync();
    this.timer = setInterval(() => void this.sync(), this.config.resendSyncIntervalMs);
    this.timer.unref();
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    await this.activeSync;
  }

  sync(): Promise<ResendSyncResult> {
    if (this.activeSync) return this.activeSync;
    const current = this.performSync().finally(() => {
      if (this.activeSync === current) this.activeSync = undefined;
    });
    this.activeSync = current;
    return current;
  }

  private async performSync(): Promise<ResendSyncResult> {
    const result: ResendSyncResult = { checked: 0, imported: 0, skipped: 0, failed: 0 };
    let listed;
    try {
      listed = await this.client.listReceived({ limit: 100 });
    } catch (error) {
      result.failed++;
      this.logger.warn(`[resend] sync failed: ${errorMessage(error)}`);
      return result;
    }
    result.checked = listed.data.length;
    for (const item of [...listed.data].reverse()) {
      try {
        const status = await this.importProviderMessage(item.id);
        result[status]++;
      } catch (error) {
        result.failed++;
        this.logger.warn(`[resend] failed ${item.id}: ${errorMessage(error)}`);
      }
    }
    if (result.imported) this.logger.info(`[resend] synced ${result.imported} new message${result.imported === 1 ? "" : "s"}`);
    return result;
  }

  async importProviderMessage(providerMessageId: string): Promise<"imported" | "skipped"> {
    if (this.db.providerMessageHandled("resend", providerMessageId)) return "skipped";
    const email = await this.client.getReceived(providerMessageId);
    const candidateAddresses = uniqueAddresses([...email.receivedFor, ...email.to]);
    const enabled = new Set(this.config.mailDomains);
    const candidates = candidateAddresses.filter((address) => enabled.has(domainOf(address)));
    const mailbox = candidates.map((address) => this.db.getMailboxRow(address)).find(Boolean);
    if (!mailbox) {
      this.db.recordProviderSkip("resend", providerMessageId, "No matching mailbox existed at receipt time.");
      this.logger.info(`[resend] skipped ${providerMessageId}: no matching mailbox`);
      return "skipped";
    }

    const receivedAt = validDate(email.createdAt);
    if (receivedAt < new Date(mailbox.created_at)) {
      this.db.recordProviderSkip("resend", providerMessageId, "Message predates mailbox creation.");
      return "skipped";
    }

    try {
      const attachments = [];
      for (const metadata of email.attachments) {
        const attachment = await this.client.getAttachment(providerMessageId, metadata.id);
        if (attachment.size > this.config.maxAttachmentBytes) {
          throw new IngestionError(413, `Attachment ${attachment.filename ?? "attachment"} is too large.`);
        }
        const content = await this.download(attachment.downloadUrl, this.config.maxAttachmentBytes);
        attachments.push({
          filename: attachment.filename ?? metadata.filename ?? "attachment",
          mimeType: attachment.contentType || metadata.contentType,
          contentBase64: content.toString("base64"),
        });
      }
      const sender = parseAddress(email.from);
      await this.ingestion.ingest({
        to: mailbox.address,
        recipients: uniqueAddresses(email.to),
        cc: uniqueAddresses(email.cc),
        replyTo: uniqueAddresses(email.replyTo),
        senderEmail: sender.email,
        subject: email.subject,
        textBody: email.text ?? "",
        headers: email.headers,
        messageId: email.messageId,
        receivedAt: receivedAt.toISOString(),
        attachments,
        provider: { name: "resend", messageId: providerMessageId },
        ...(sender.name ? { senderName: sender.name } : {}),
        ...(email.html ? { htmlBody: email.html } : {}),
      });
      return "imported";
    } catch (error) {
      if (error instanceof IngestionError && error.statusCode >= 400 && error.statusCode < 500) {
        this.db.recordProviderSkip("resend", providerMessageId, error.message);
        this.logger.info(`[resend] skipped ${providerMessageId}: ${error.message}`);
        return "skipped";
      }
      throw error;
    }
  }
}

async function downloadAttachment(url: string, maximumBytes: number): Promise<Buffer> {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") throw new Error("Resend attachment URL was not HTTPS.");
  const response = await fetch(parsed, { signal: AbortSignal.timeout(15_000), redirect: "error" });
  if (!response.ok) throw new Error(`Attachment download failed with HTTP ${response.status}.`);
  const declaredSize = Number(response.headers.get("content-length") ?? 0);
  if (declaredSize > maximumBytes) throw new IngestionError(413, "Attachment is too large.");
  const content = Buffer.from(await response.arrayBuffer());
  if (content.byteLength > maximumBytes) throw new IngestionError(413, "Attachment is too large.");
  return content;
}

function parseAddress(value: string): { name?: string; email: string } {
  const bracketed = value.match(/^\s*(.*?)\s*<([^<>\s]+@[^<>\s]+)>\s*$/);
  if (bracketed) {
    const name = bracketed[1]!.replace(/^['"]|['"]$/g, "").trim();
    return { ...(name ? { name } : {}), email: bracketed[2]!.toLowerCase() };
  }
  const email = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
  return { email: (email ?? value).trim().toLowerCase() };
}

function uniqueAddresses(values: string[]): string[] {
  return [...new Set(values.map((value) => parseAddress(value).email).filter((value) => /^\S+@\S+\.\S+$/.test(value)))];
}

function domainOf(address: string): string { return address.split("@").at(-1)?.toLowerCase() ?? ""; }

function validDate(value: string): Date {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("Resend returned an invalid received timestamp.");
  return date;
}

function errorMessage(error: unknown): string { return error instanceof Error ? error.message : "Unknown provider error"; }
