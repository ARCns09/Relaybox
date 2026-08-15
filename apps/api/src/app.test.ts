import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { FastifyInstance } from "fastify";
import { buildApp } from "./app.js";
import type { ResendInboundClient } from "./providers/resend-client.js";

describe("Relaybox API", () => {
  let directory: string;
  let app: FastifyInstance & { appContext: Awaited<ReturnType<typeof buildApp>>["appContext"] };

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "relaybox-test-"));
    app = await buildApp({
      nodeEnv: "test", isDevelopment: true, databasePath: join(directory, "test.db"), attachmentStoragePath: join(directory, "attachments"),
      mailDomain: "mail.test", storageLimitBytes: 1024 * 1024, maxMessageBytes: 512 * 1024, maxAttachmentBytes: 128 * 1024,
      allowDeletions: true,
    });
  });

  afterEach(async () => { await app.close(); await rm(directory, { recursive: true, force: true }); });

  async function create(alias = "pixel-fox", lifetimeSeconds: number | null = 600) {
    const response = await app.inject({ method: "POST", url: "/api/mailboxes", payload: { alias, lifetimeSeconds } });
    expect(response.statusCode).toBe(201);
    return response.json() as { mailbox: { id: string; address: string }; token: string };
  }

  it("creates a mailbox and requires its secret token", async () => {
    const created = await create();
    const denied = await app.inject({ method: "GET", url: `/api/mailboxes/${created.mailbox.address}` });
    expect(denied.statusCode).toBe(401);
    const allowed = await app.inject({ method: "GET", url: `/api/mailboxes/${created.mailbox.address}`, headers: { authorization: `Bearer ${created.token}` } });
    expect(allowed.statusCode).toBe(200);
    expect(allowed.json().mailbox.address).toBe("pixel-fox@mail.test");
  });

  it("validates aliases and prevents collisions", async () => {
    const reserved = await app.inject({ method: "POST", url: "/api/mailboxes", payload: { alias: "admin", lifetimeSeconds: 600 } });
    expect(reserved.statusCode).toBe(400);
    await create("unique-name");
    const duplicate = await app.inject({ method: "POST", url: "/api/mailboxes", payload: { alias: "unique-name", lifetimeSeconds: 600 } });
    expect(duplicate.statusCode).toBe(409);
  });

  it("creates mailboxes only on configured real domains", async () => {
    await app.close();
    app = await buildApp({
      nodeEnv: "test", isDevelopment: true, databasePath: join(directory, "domains.db"), attachmentStoragePath: join(directory, "domain-files"),
      mailDomain: "relaybox.ryzn.pro", mailDomains: ["relaybox.ryzn.pro"], storageLimitBytes: 1024 * 1024,
      maxMessageBytes: 512 * 1024, maxAttachmentBytes: 128 * 1024, resendInboundEnabled: false,
    });
    const allowed = await app.inject({ method: "POST", url: "/api/mailboxes", payload: { alias: "real-mail", domain: "relaybox.ryzn.pro", lifetimeSeconds: 600 } });
    expect(allowed.statusCode).toBe(201);
    expect(allowed.json().mailbox.address).toBe("real-mail@relaybox.ryzn.pro");
    const denied = await app.inject({ method: "POST", url: "/api/mailboxes", payload: { alias: "wrong-mail", domain: "unconfigured.example", lifetimeSeconds: 600 } });
    expect(denied.statusCode).toBe(400);
  });

  it("provides a development-only manual Resend synchronization endpoint", async () => {
    await app.close();
    const resendClient: ResendInboundClient = {
      listReceived: vi.fn(async () => ({ data: [], hasMore: false })),
      getReceived: vi.fn(async () => { throw new Error("not called"); }),
      getAttachment: vi.fn(async () => { throw new Error("not called"); }),
    };
    app = await buildApp({
      nodeEnv: "test", isDevelopment: true, databasePath: join(directory, "manual-sync.db"), attachmentStoragePath: join(directory, "manual-sync-files"),
      mailDomain: "relaybox.ryzn.pro", mailDomains: ["relaybox.ryzn.pro"], storageLimitBytes: 1024 * 1024,
      maxMessageBytes: 512 * 1024, maxAttachmentBytes: 128 * 1024, resendInboundEnabled: true, resendApiKey: "test-key",
    }, { resendClient });
    await app.appContext.resendInbound?.sync();
    const response = await app.inject({ method: "POST", url: "/api/dev/resend/sync" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ checked: 0, imported: 0, skipped: 0, failed: 0 });
    expect(resendClient.listReceived).toHaveBeenCalled();
  });

  it("preserves never-expiring and multi-year mailbox lifetimes", async () => {
    const permanent = await create("permanent-box", null);
    expect((await app.inject({ method: "GET", url: `/api/mailboxes/${permanent.mailbox.address}`, headers: { authorization: `Bearer ${permanent.token}` } })).json().mailbox.expiresAt).toBeNull();

    const multiYear = await create("long-lived-box", 2 * 31_536_000);
    const details = (await app.inject({ method: "GET", url: `/api/mailboxes/${multiYear.mailbox.address}`, headers: { authorization: `Bearer ${multiYear.token}` } })).json().mailbox;
    expect(new Date(details.expiresAt).getTime() - new Date(details.createdAt).getTime()).toBe(2 * 31_536_000 * 1000);
  });

  it("injects, sanitizes, and reads a message", async () => {
    const created = await create();
    const injected = await app.inject({ method: "POST", url: "/api/dev/inject-email", payload: {
      to: created.mailbox.address, senderName: "GitHub", senderEmail: "notifications@github.com", subject: "Security alert",
      textBody: "A new sign-in was detected.", htmlBody: `<h1>Hello</h1><script>alert(1)</script><img src="https://tracker.test/pixel">`,
      attachments: [{ filename: "report.txt", mimeType: "text/plain", contentBase64: Buffer.from("safe report").toString("base64") }],
    } });
    expect(injected.statusCode).toBe(201);
    expect(injected.json().message.logo).toEqual({ kind: "brand", value: "github" });
    const id = injected.json().message.id as string;
    const auth = { authorization: `Bearer ${created.token}` };
    const detail = await app.inject({ method: "GET", url: `/api/mailboxes/${created.mailbox.address}/messages/${id}`, headers: auth });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().message.htmlBody).not.toContain("script");
    expect(detail.json().message.htmlBody).toContain("data-remote-src");
    expect(detail.json().message.attachments[0].filename).toBe("report.txt");
    const marked = await app.inject({ method: "PATCH", url: `/api/mailboxes/${created.mailbox.address}/messages/${id}`, headers: auth, payload: { isRead: true } });
    expect(marked.json().message.isRead).toBe(true);
  });

  it("rejects delivery to an expired mailbox", async () => {
    const created = await create();
    app.appContext.db.connection.prepare("UPDATE mailboxes SET expires_at = ? WHERE id = ?").run(new Date(Date.now() - 1000).toISOString(), created.mailbox.id);
    const response = await app.inject({ method: "POST", url: "/api/dev/inject-email", payload: {
      to: created.mailbox.address, senderEmail: "sender@example.com", textBody: "Too late",
    } });
    expect(response.statusCode).toBe(410);
  });

  it("enforces mailbox quota", async () => {
    await app.close();
    app = await buildApp({
      nodeEnv: "test", isDevelopment: true, databasePath: join(directory, "quota.db"), attachmentStoragePath: join(directory, "quota-files"),
      mailDomain: "mail.test", storageLimitBytes: 20, maxMessageBytes: 1000, maxAttachmentBytes: 500,
    });
    const created = await create("tiny-box");
    const response = await app.inject({ method: "POST", url: "/api/dev/inject-email", payload: {
      to: created.mailbox.address, senderEmail: "sender@example.com", textBody: "This message is more than twenty bytes long.",
    } });
    expect(response.statusCode).toBe(413);
  });

  it("can disable mailbox and message deletion with the feature flag", async () => {
    await app.close();
    app = await buildApp({
      nodeEnv: "test", isDevelopment: true, databasePath: join(directory, "restricted.db"), attachmentStoragePath: join(directory, "restricted-files"),
      mailDomain: "mail.test", storageLimitBytes: 1024 * 1024, maxMessageBytes: 512 * 1024, maxAttachmentBytes: 128 * 1024,
      allowDeletions: false,
    });
    const created = await create("read-only-box");
    const headers = { authorization: `Bearer ${created.token}` };
    const mailboxResponse = await app.inject({ method: "DELETE", url: `/api/mailboxes/${created.mailbox.address}`, headers });
    const messageResponse = await app.inject({ method: "DELETE", url: `/api/mailboxes/${created.mailbox.address}/messages/unknown`, headers });
    expect(mailboxResponse.statusCode).toBe(403);
    expect(messageResponse.statusCode).toBe(403);
  });

  it("retains backend deletion logic behind the explicit feature flag", async () => {
    await app.close();
    app = await buildApp({
      nodeEnv: "test", isDevelopment: true, databasePath: join(directory, "deletion.db"), attachmentStoragePath: join(directory, "deletion-files"),
      mailDomain: "mail.test", storageLimitBytes: 1024 * 1024, maxMessageBytes: 512 * 1024, maxAttachmentBytes: 128 * 1024,
      allowDeletions: true,
    });
    const created = await create("delete-me");
    const response = await app.inject({ method: "DELETE", url: `/api/mailboxes/${created.mailbox.address}`, headers: { authorization: `Bearer ${created.token}` } });
    expect(response.statusCode).toBe(204);
    const missing = await app.inject({ method: "GET", url: `/api/mailboxes/${created.mailbox.address}`, headers: { authorization: `Bearer ${created.token}` } });
    expect(missing.statusCode).toBe(404);
    const recreated = await create("delete-me", null);
    expect(recreated.mailbox.address).toBe("delete-me@mail.test");
  });
});
