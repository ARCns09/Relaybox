import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import type { CreateMailboxInput, InjectEmailInput } from "@relaybox/shared";
import { loadConfig, type AppConfig } from "./config.js";
import { MailDatabase } from "./database.js";
import { createAccessToken, generateAlias, hashToken, normalizeAlias, tokenMatches, validateAlias } from "./security.js";
import { LocalAttachmentStorage } from "./storage.js";
import { RealtimeHub } from "./realtime.js";
import { IngestionError, IngestionService } from "./ingestion.js";
import { OutboundError, OutboundService, type ReplyInput } from "./outbound.js";
import { OfficialResendInboundClient, type ResendInboundClient } from "./providers/resend-client.js";
import { ResendInboundAdapter, type AttachmentDownloader } from "./providers/resend-inbound.js";

interface AddressParams { address: string }
interface MessageParams extends AddressParams { messageId: string }
interface AttachmentParams extends AddressParams { attachmentId: string }

class HttpError extends Error {
  constructor(readonly statusCode: number, message: string, readonly details?: string[]) { super(message); }
}

export interface AppContext {
  config: AppConfig;
  db: MailDatabase;
  realtime: RealtimeHub;
  resendInbound?: ResendInboundAdapter;
}

export interface AppDependencies {
  resendClient?: ResendInboundClient;
  attachmentDownloader?: AttachmentDownloader;
}

export async function buildApp(overrides: Partial<AppConfig> = {}, dependencies: AppDependencies = {}): Promise<FastifyInstance & { appContext: AppContext }> {
  const config = loadConfig(overrides);
  if (config.resendInboundEnabled && !config.resendApiKey && !dependencies.resendClient) {
    throw new Error("RESEND_API_KEY is required when RESEND_INBOUND_ENABLED=true");
  }
  const app = Fastify({ logger: config.nodeEnv !== "test", bodyLimit: config.maxMessageBytes * 2 });
  const db = new MailDatabase(config);
  const storage = new LocalAttachmentStorage(config.attachmentStoragePath);
  const realtime = new RealtimeHub();
  const ingestion = new IngestionService(config, db, storage, realtime);
  const outbound = new OutboundService(config);
  const resendClient = config.resendInboundEnabled
    ? dependencies.resendClient ?? new OfficialResendInboundClient(config.resendApiKey)
    : undefined;
  const resendInbound = resendClient ? new ResendInboundAdapter(
    config, resendClient, db, ingestion,
    { info: (message) => app.log.info(message), warn: (message) => app.log.warn(message) },
    dependencies.attachmentDownloader,
  ) : undefined;

  await app.register(cors, {
    origin: config.appUrl,
    allowedHeaders: ["authorization", "content-type"],
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  });
  await app.register(helmet, { contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: "same-site" } });
  await app.register(rateLimit, { max: 180, timeWindow: "1 minute" });

  const authenticate = (request: FastifyRequest<{ Params: AddressParams }>, options: { allowExpired?: boolean } = {}) => {
    const address = request.params.address.toLowerCase();
    const row = db.getMailboxRow(address);
    if (!row) throw new HttpError(404, "Mailbox not found.");
    const token = request.headers.authorization?.replace(/^Bearer\s+/i, "") ?? "";
    if (!token || !tokenMatches(token, row.access_token)) throw new HttpError(401, "Mailbox token is missing or invalid.");
    const expired = !row.is_active || Boolean(row.expires_at && new Date(row.expires_at) <= new Date());
    if (expired && !options.allowExpired) throw new HttpError(410, "Mailbox has expired.");
    return row;
  };

  app.setErrorHandler((error, _request, reply) => {
    const candidate = error as { statusCode?: unknown; message?: unknown };
    const statusCode = typeof candidate.statusCode === "number" ? candidate.statusCode : 500;
    if (statusCode >= 500) app.log.error(error);
    const details = error instanceof HttpError ? error.details : undefined;
    const message = typeof candidate.message === "string" ? candidate.message : "Request failed.";
    return reply.status(statusCode).send({ error: statusCode >= 500 ? "Unexpected server error." : message, ...(details ? { details } : {}) });
  });

  app.get("/api/health", async () => ({
    status: "ok", mailDomain: config.mailDomain, mailDomains: config.mailDomains, defaultLifetime: config.defaultLifetime,
    storageLimit: config.storageLimitBytes, outboundConfigured: outbound.configured, isDevelopment: config.isDevelopment,
  }));

  app.post<{ Body: CreateMailboxInput }>("/api/mailboxes", { config: { rateLimit: { max: 12, timeWindow: "1 hour" } } }, async (request, reply) => {
    const lifetime = request.body?.lifetimeSeconds === undefined ? config.defaultLifetime : request.body.lifetimeSeconds;
    if (lifetime !== null && (!Number.isInteger(lifetime) || lifetime < 300 || lifetime > 3_153_600_000)) {
      throw new HttpError(400, "Lifetime must be between 5 minutes and 100 years, or never expire.");
    }
    let alias = request.body?.alias ? normalizeAlias(request.body.alias) : "";
    const domain = request.body?.domain?.trim().toLowerCase() || config.mailDomain;
    if (!config.mailDomains.includes(domain)) throw new HttpError(400, "That mailbox domain is not enabled.");
    if (alias) {
      const details = validateAlias(alias);
      if (details.length) throw new HttpError(400, "Alias is invalid.", details);
    } else {
      do alias = generateAlias(); while (db.aliasExists(`${alias}@${domain}`));
    }
    if (db.aliasExists(`${alias}@${domain}`)) throw new HttpError(409, "That address is already in use.");
    const token = createAccessToken();
    const mailbox = db.createMailbox(alias, domain, hashToken(token), lifetime);
    return reply.status(201).send({ mailbox, token });
  });

  app.get<{ Params: AddressParams }>("/api/mailboxes/:address", async (request) => {
    const row = authenticate(request, { allowExpired: true });
    const expired = !row.is_active || Boolean(row.expires_at && new Date(row.expires_at) <= new Date());
    return { mailbox: expired ? db.getMailboxById(row.id) : db.touchMailbox(row.id) };
  });

  app.delete<{ Params: AddressParams }>("/api/mailboxes/:address", async (request, reply) => {
    if (!config.allowDeletions) throw new HttpError(403, "Mailbox deletion is disabled.");
    const row = authenticate(request, { allowExpired: true });
    const paths = db.deleteMailbox(row.id);
    await Promise.all(paths.map((path) => storage.delete(path)));
    realtime.publish(row.id, { type: "mailbox:deleted" });
    return reply.status(204).send();
  });

  app.get<{ Params: AddressParams; Querystring: { search?: string; sort?: string } }>("/api/mailboxes/:address/messages", async (request) => {
    const row = authenticate(request);
    const sort = ["newest", "oldest", "sender"].includes(request.query.sort ?? "")
      ? request.query.sort as "newest" | "oldest" | "sender" : "newest";
    return { messages: db.listMessages(row.id, request.query.search ?? "", sort), mailbox: db.touchMailbox(row.id) };
  });

  app.get<{ Params: MessageParams }>("/api/mailboxes/:address/messages/:messageId", async (request) => {
    const row = authenticate(request);
    const message = db.getMessage(row.id, request.params.messageId);
    if (!message) throw new HttpError(404, "Message not found.");
    return { message };
  });

  app.patch<{ Params: MessageParams; Body: { isRead: boolean } }>("/api/mailboxes/:address/messages/:messageId", async (request) => {
    const row = authenticate(request);
    const message = db.markRead(row.id, request.params.messageId, Boolean(request.body?.isRead));
    if (!message) throw new HttpError(404, "Message not found.");
    return { message };
  });

  app.delete<{ Params: MessageParams }>("/api/mailboxes/:address/messages/:messageId", async (request, reply) => {
    if (!config.allowDeletions) throw new HttpError(403, "Message deletion is disabled.");
    const row = authenticate(request);
    const paths = db.deleteMessage(row.id, request.params.messageId);
    if (!paths.length && !db.getMessage(row.id, request.params.messageId)) {
      // A message without attachments also returns no paths, so deletion is intentionally idempotent.
    }
    await Promise.all(paths.map((path) => storage.delete(path)));
    return reply.status(204).send();
  });

  app.get<{ Params: AttachmentParams }>("/api/mailboxes/:address/attachments/:attachmentId", async (request, reply) => {
    const row = authenticate(request);
    const attachment = db.attachment(row.id, request.params.attachmentId);
    if (!attachment) throw new HttpError(404, "Attachment not found.");
    const content = await storage.get(attachment.storage_path);
    return reply
      .header("Content-Type", attachment.mime_type)
      .header("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(attachment.filename)}`)
      .header("X-Content-Type-Options", "nosniff")
      .send(content);
  });

  app.post<{ Params: AddressParams; Body: ReplyInput }>("/api/mailboxes/:address/reply", {
    config: { rateLimit: { max: 10, timeWindow: "1 hour" } },
  }, async (request, reply) => {
    const row = authenticate(request);
    const messageId = await outbound.send(row.address, request.body);
    return reply.status(202).send({ messageId });
  });

  app.get<{ Params: AddressParams }>("/api/mailboxes/:address/events", async (request, reply) => {
    const row = authenticate(request);
    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive",
      "X-Accel-Buffering": "no", "Access-Control-Allow-Origin": config.appUrl,
    });
    const write = (event: unknown) => reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    write({ type: "connected" });
    const unsubscribe = realtime.subscribe(row.id, write);
    const heartbeat = setInterval(() => reply.raw.write(": heartbeat\n\n"), 20_000);
    request.raw.on("close", () => { clearInterval(heartbeat); unsubscribe(); });
  });

  if (config.isDevelopment) {
    app.post<{ Body: InjectEmailInput }>("/api/dev/inject-email", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (request, reply) => {
      const message = await ingestion.ingest(request.body);
      return reply.status(201).send({ message });
    });
    app.post("/api/dev/resend/sync", async () => {
      if (!resendInbound) throw new HttpError(503, "Resend inbound synchronization is not enabled.");
      return resendInbound.sync();
    });
  }

  const cleanup = async () => {
    for (const id of db.expiredMailboxIds()) {
      realtime.publish(id, { type: "mailbox:expired" });
      const paths = db.deleteMailbox(id);
      await Promise.all(paths.map((path) => storage.delete(path)));
    }
  };
  const cleanupTimer = setInterval(() => void cleanup(), 60_000);
  cleanupTimer.unref();
  await cleanup();

  app.addHook("onClose", async () => {
    clearInterval(cleanupTimer);
    await resendInbound?.stop();
    db.close();
  });
  resendInbound?.start();
  Object.assign(app, { appContext: { config, db, realtime, ...(resendInbound ? { resendInbound } : {}) } });
  return app as unknown as FastifyInstance & { appContext: AppContext };
}

export { HttpError, IngestionError, OutboundError };
