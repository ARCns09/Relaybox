import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadConfig, type AppConfig } from "../config.js";
import { MailDatabase } from "../database.js";
import { IngestionService } from "../ingestion.js";
import { RealtimeHub } from "../realtime.js";
import { LocalAttachmentStorage } from "../storage.js";
import { ResendInboundAdapter } from "./resend-inbound.js";
import type { ResendInboundClient, ResendReceivedEmail } from "./resend-client.js";

class MockResendClient implements ResendInboundClient {
  listCalls = 0;
  getCalls = 0;
  failList = false;
  messages = new Map<string, ResendReceivedEmail>();
  attachment = { id: "attachment-1", filename: "invoice.txt", size: 7, contentType: "text/plain", downloadUrl: "https://inbound-cdn.resend.test/file" };

  async listReceived() {
    this.listCalls++;
    if (this.failList) throw new Error("Temporary Resend outage");
    return { data: [...this.messages.keys()].map((id) => ({ id })), hasMore: false };
  }

  async getReceived(id: string) {
    this.getCalls++;
    const message = this.messages.get(id);
    if (!message) throw new Error("Email not found");
    return message;
  }

  async getAttachment() { return this.attachment; }
}

describe("Resend local inbound adapter", () => {
  let directory: string;
  let config: AppConfig;
  let db: MailDatabase;
  let storage: LocalAttachmentStorage;
  let client: MockResendClient;
  const logger = { info: vi.fn(), warn: vi.fn() };
  const download = vi.fn(async () => Buffer.from("invoice"));

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "relaybox-resend-test-"));
    config = loadConfig({
      nodeEnv: "test", isDevelopment: true, databasePath: join(directory, "mail.db"), attachmentStoragePath: join(directory, "attachments"),
      mailDomain: "relaybox.ryzn.pro", mailDomains: ["relaybox.ryzn.pro"], resendInboundEnabled: true, resendApiKey: "test-key",
      resendSyncIntervalMs: 10_000, storageLimitBytes: 1024 * 1024, maxMessageBytes: 512 * 1024, maxAttachmentBytes: 128 * 1024,
    });
    db = new MailDatabase(config);
    storage = new LocalAttachmentStorage(config.attachmentStoragePath);
    client = new MockResendClient();
    logger.info.mockClear(); logger.warn.mockClear(); download.mockClear();
  });

  afterEach(async () => { db.close(); await rm(directory, { recursive: true, force: true }); });

  function createMailbox(alias = "test") {
    return db.createMailbox(alias, "relaybox.ryzn.pro", "token-hash", 86400);
  }

  function email(id: string, to = "test@relaybox.ryzn.pro", attachments = false): ResendReceivedEmail {
    return {
      id, to: [to], receivedFor: [to], from: "Gmail Sender <sender@gmail.com>", createdAt: new Date(Date.now() + 1000).toISOString(),
      subject: "A real inbound email", cc: ["copy@example.com"], replyTo: ["reply@example.com"],
      html: `<h1>Safe</h1><script>alert(1)</script><img src="https://tracker.test/pixel">`, text: "Plain text",
      headers: { "message-id": `<${id}@gmail.com>`, references: "<thread@gmail.com>" }, messageId: `<${id}@gmail.com>`,
      attachments: attachments ? [{ id: "attachment-1", filename: "invoice.txt", size: 7, contentType: "text/plain" }] : [],
    };
  }

  function adapter() {
    return new ResendInboundAdapter(config, client, db, new IngestionService(config, db, storage, new RealtimeHub()), logger, download);
  }

  it("imports full content through ingestion, including safe attachments and threading metadata", async () => {
    const mailbox = createMailbox();
    client.messages.set("resend-1", email("resend-1", mailbox.address, true));
    const result = await adapter().sync();
    expect(result).toEqual({ checked: 1, imported: 1, skipped: 0, failed: 0 });
    const summary = db.listMessages(mailbox.id)[0]!;
    const message = db.getMessage(mailbox.id, summary.id)!;
    expect(message.senderName).toBe("Gmail Sender");
    expect(message.receivedAt).toBe(client.messages.get("resend-1")!.createdAt);
    expect(message.messageId).toBe("<resend-1@gmail.com>");
    expect(message.cc).toEqual(["copy@example.com"]);
    expect(message.replyTo).toEqual(["reply@example.com"]);
    expect(message.headers.references).toBe("<thread@gmail.com>");
    expect(message.htmlBody).not.toContain("script");
    expect(message.htmlBody).toContain("data-remote-src");
    expect(message.attachments[0]?.filename).toBe("invoice.txt");
    const stored = db.connection.prepare("SELECT storage_path FROM attachments WHERE message_id = ?").get(summary.id) as { storage_path: string };
    expect(await readFile(join(config.attachmentStoragePath, stored.storage_path), "utf8")).toBe("invoice");
  });

  it("skips unknown and expired mailbox recipients persistently", async () => {
    client.messages.set("unknown", email("unknown", "missing@relaybox.ryzn.pro"));
    const expired = createMailbox("expired");
    db.connection.prepare("UPDATE mailboxes SET expires_at = ? WHERE id = ?").run(new Date(Date.now() - 1000).toISOString(), expired.id);
    client.messages.set("expired", email("expired", expired.address));
    const result = await adapter().sync();
    expect(result).toEqual({ checked: 2, imported: 0, skipped: 2, failed: 0 });
    expect(db.connection.prepare("SELECT COUNT(*) AS count FROM provider_messages WHERE status = 'skipped'").get()).toEqual(expect.objectContaining({ count: 2 }));
    expect(db.listMessages(expired.id)).toHaveLength(0);
  });

  it("never duplicates an imported provider message, including after database restart", async () => {
    const mailbox = createMailbox();
    client.messages.set("resend-once", email("resend-once", mailbox.address));
    expect((await adapter().sync()).imported).toBe(1);
    expect((await adapter().sync()).skipped).toBe(1);
    expect(db.listMessages(mailbox.id)).toHaveLength(1);

    db.close();
    db = new MailDatabase(config);
    storage = new LocalAttachmentStorage(config.attachmentStoragePath);
    const restarted = adapter();
    expect((await restarted.sync()).imported).toBe(0);
    expect(db.listMessages(mailbox.id)).toHaveLength(1);
    expect(client.getCalls).toBe(1);
  });

  it("contains temporary API failures without crashing or marking messages handled", async () => {
    client.failList = true;
    const worker = adapter();
    await expect(worker.sync()).resolves.toEqual({ checked: 0, imported: 0, skipped: 0, failed: 1 });
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("Temporary Resend outage"));
    expect(db.connection.prepare("SELECT COUNT(*) AS count FROM provider_messages").get()).toEqual(expect.objectContaining({ count: 0 }));
  });

  it("does not poll when the integration is disabled", async () => {
    config = { ...config, resendInboundEnabled: false, resendSyncIntervalMs: 5 };
    const worker = adapter();
    worker.start();
    await new Promise((resolve) => setTimeout(resolve, 20));
    await worker.stop();
    expect(client.listCalls).toBe(0);
  });
});
