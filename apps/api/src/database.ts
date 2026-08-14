import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import type { Mailbox, Message, MessageSummary } from "@relaybox/shared";
import type { AppConfig } from "./config.js";
import { SenderLogoResolver } from "./logos.js";
import { plainTextPreview } from "./sanitizer.js";

interface MailboxRow {
  id: string; address: string; alias: string; domain: string; created_at: string; expires_at: string | null;
  last_accessed_at: string; storage_used: number; is_active: number; access_token: string;
}

interface MessageRow {
  id: string; mailbox_id: string; message_id: string; sender_name: string; sender_email: string;
  recipients: string; subject: string; text_body: string; html_body: string | null; received_at: string;
  is_read: number; has_attachments: number; size: number;
}

interface AttachmentRow { id: string; message_id: string; filename: string; mime_type: string; size: number; storage_path: string }

export interface NewMessageRecord {
  mailboxId: string;
  messageId: string;
  senderName: string;
  senderEmail: string;
  recipients: string[];
  subject: string;
  textBody: string;
  htmlBody: string | null;
  receivedAt: string;
  size: number;
  attachments: Array<{ filename: string; mimeType: string; size: number; storagePath: string }>;
}

export class MailDatabase {
  readonly connection: DatabaseSync;
  private readonly logos: SenderLogoResolver;

  constructor(private readonly config: AppConfig) {
    mkdirSync(dirname(config.databasePath), { recursive: true });
    this.connection = new DatabaseSync(config.databasePath);
    this.connection.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
    this.migrate();
    this.logos = new SenderLogoResolver(this.connection);
  }

  private migrate(): void {
    this.connection.exec(`
      CREATE TABLE IF NOT EXISTS mailboxes (
        id TEXT PRIMARY KEY,
        address TEXT NOT NULL UNIQUE,
        alias TEXT NOT NULL,
        domain TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT,
        last_accessed_at TEXT NOT NULL,
        storage_used INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        access_token TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        mailbox_id TEXT NOT NULL REFERENCES mailboxes(id) ON DELETE CASCADE,
        message_id TEXT NOT NULL,
        sender_name TEXT NOT NULL DEFAULT '',
        sender_email TEXT NOT NULL,
        recipients TEXT NOT NULL,
        subject TEXT NOT NULL DEFAULT '(No subject)',
        text_body TEXT NOT NULL DEFAULT '',
        html_body TEXT,
        received_at TEXT NOT NULL,
        is_read INTEGER NOT NULL DEFAULT 0,
        has_attachments INTEGER NOT NULL DEFAULT 0,
        size INTEGER NOT NULL DEFAULT 0,
        UNIQUE(mailbox_id, message_id)
      );
      CREATE TABLE IF NOT EXISTS attachments (
        id TEXT PRIMARY KEY,
        message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        filename TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size INTEGER NOT NULL,
        storage_path TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sender_logos (
        domain TEXT PRIMARY KEY,
        logo_url TEXT NOT NULL,
        source TEXT NOT NULL,
        cached_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_messages_mailbox_received ON messages(mailbox_id, received_at DESC);
      CREATE INDEX IF NOT EXISTS idx_mailboxes_expiry ON mailboxes(is_active, expires_at);
    `);
  }

  close(): void { this.connection.close(); }

  createMailbox(alias: string, domain: string, tokenHash: string, lifetimeSeconds: number | null): Mailbox {
    const id = randomUUID();
    const now = new Date();
    const createdAt = now.toISOString();
    const expiresAt = lifetimeSeconds === null ? null : new Date(now.getTime() + lifetimeSeconds * 1000).toISOString();
    const address = `${alias}@${domain}`;
    this.connection.prepare(`
      INSERT INTO mailboxes (id, address, alias, domain, created_at, expires_at, last_accessed_at, access_token)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, address, alias, domain, createdAt, expiresAt, createdAt, tokenHash);
    return this.getMailboxById(id)!;
  }

  private mailboxFromRow(row: MailboxRow): Mailbox {
    const unread = this.connection.prepare("SELECT COUNT(*) AS count FROM messages WHERE mailbox_id = ? AND is_read = 0")
      .get(row.id) as { count: number };
    return {
      id: row.id,
      address: row.address,
      alias: row.alias,
      domain: row.domain,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      lastAccessedAt: row.last_accessed_at,
      storageUsed: row.storage_used,
      storageLimit: this.config.storageLimitBytes,
      isActive: Boolean(row.is_active) && (!row.expires_at || new Date(row.expires_at) > new Date()),
      unreadCount: unread.count,
    };
  }

  getMailboxRow(address: string): MailboxRow | undefined {
    return this.connection.prepare("SELECT * FROM mailboxes WHERE address = ?").get(address.toLowerCase()) as MailboxRow | undefined;
  }

  getMailboxById(id: string): Mailbox | undefined {
    const row = this.connection.prepare("SELECT * FROM mailboxes WHERE id = ?").get(id) as MailboxRow | undefined;
    return row ? this.mailboxFromRow(row) : undefined;
  }

  touchMailbox(id: string): Mailbox {
    this.connection.prepare("UPDATE mailboxes SET last_accessed_at = ? WHERE id = ?").run(new Date().toISOString(), id);
    return this.getMailboxById(id)!;
  }

  aliasExists(address: string): boolean { return Boolean(this.getMailboxRow(address)); }

  listMessages(mailboxId: string, search = "", sort: "newest" | "oldest" | "sender" = "newest"): MessageSummary[] {
    const orders = { newest: "received_at DESC", oldest: "received_at ASC", sender: "sender_name COLLATE NOCASE ASC" } as const;
    const query = search.trim();
    const rows = (query
      ? this.connection.prepare(`SELECT * FROM messages WHERE mailbox_id = ? AND (subject LIKE ? OR sender_name LIKE ? OR sender_email LIKE ? OR text_body LIKE ?) ORDER BY ${orders[sort]}`)
          .all(mailboxId, ...Array(4).fill(`%${query}%`))
      : this.connection.prepare(`SELECT * FROM messages WHERE mailbox_id = ? ORDER BY ${orders[sort]}`).all(mailboxId)) as unknown as MessageRow[];
    return rows.map((row) => this.messageSummary(row));
  }

  private messageSummary(row: MessageRow): MessageSummary {
    return {
      id: row.id,
      senderName: row.sender_name || row.sender_email.split("@")[0] || "Unknown sender",
      senderEmail: row.sender_email,
      subject: row.subject,
      preview: plainTextPreview(row.text_body, row.html_body),
      receivedAt: row.received_at,
      isRead: Boolean(row.is_read),
      hasAttachments: Boolean(row.has_attachments),
      size: row.size,
      logo: this.logos.resolve(row.sender_email),
    };
  }

  getMessage(mailboxId: string, id: string): Message | undefined {
    const row = this.connection.prepare("SELECT * FROM messages WHERE id = ? AND mailbox_id = ?").get(id, mailboxId) as MessageRow | undefined;
    if (!row) return undefined;
    const attachments = this.connection.prepare("SELECT id, filename, mime_type, size FROM attachments WHERE message_id = ?").all(id) as unknown as
      Array<Pick<AttachmentRow, "id" | "filename" | "mime_type" | "size">>;
    return {
      ...this.messageSummary(row),
      recipients: JSON.parse(row.recipients) as string[],
      textBody: row.text_body,
      htmlBody: row.html_body,
      messageId: row.message_id,
      attachments: attachments.map((attachment) => ({
        id: attachment.id, filename: attachment.filename, mimeType: attachment.mime_type, size: attachment.size,
      })),
    };
  }

  insertMessage(record: NewMessageRecord): MessageSummary {
    const id = randomUUID();
    this.connection.exec("BEGIN IMMEDIATE");
    try {
      this.connection.prepare(`
        INSERT INTO messages (id, mailbox_id, message_id, sender_name, sender_email, recipients, subject, text_body, html_body, received_at, has_attachments, size)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, record.mailboxId, record.messageId, record.senderName, record.senderEmail, JSON.stringify(record.recipients), record.subject,
        record.textBody, record.htmlBody, record.receivedAt, record.attachments.length ? 1 : 0, record.size);
      const insertAttachment = this.connection.prepare("INSERT INTO attachments (id, message_id, filename, mime_type, size, storage_path) VALUES (?, ?, ?, ?, ?, ?)");
      for (const attachment of record.attachments) {
        insertAttachment.run(randomUUID(), id, attachment.filename, attachment.mimeType, attachment.size, attachment.storagePath);
      }
      this.connection.prepare("UPDATE mailboxes SET storage_used = storage_used + ? WHERE id = ?").run(record.size, record.mailboxId);
      this.connection.exec("COMMIT");
    } catch (error) {
      this.connection.exec("ROLLBACK");
      throw error;
    }
    return this.messageSummary(this.connection.prepare("SELECT * FROM messages WHERE id = ?").get(id) as unknown as MessageRow);
  }

  markRead(mailboxId: string, id: string, isRead: boolean): Message | undefined {
    this.connection.prepare("UPDATE messages SET is_read = ? WHERE id = ? AND mailbox_id = ?").run(isRead ? 1 : 0, id, mailboxId);
    return this.getMessage(mailboxId, id);
  }

  deleteMessage(mailboxId: string, id: string): string[] {
    const row = this.connection.prepare("SELECT size FROM messages WHERE id = ? AND mailbox_id = ?").get(id, mailboxId) as { size: number } | undefined;
    if (!row) return [];
    const paths = this.connection.prepare("SELECT storage_path FROM attachments WHERE message_id = ?").all(id) as unknown as Array<{ storage_path: string }>;
    this.connection.exec("BEGIN IMMEDIATE");
    try {
      this.connection.prepare("DELETE FROM messages WHERE id = ? AND mailbox_id = ?").run(id, mailboxId);
      this.connection.prepare("UPDATE mailboxes SET storage_used = MAX(0, storage_used - ?) WHERE id = ?").run(row.size, mailboxId);
      this.connection.exec("COMMIT");
    } catch (error) {
      this.connection.exec("ROLLBACK");
      throw error;
    }
    return paths.map((entry) => entry.storage_path);
  }

  attachment(mailboxId: string, id: string): AttachmentRow | undefined {
    return this.connection.prepare(`
      SELECT a.* FROM attachments a JOIN messages m ON m.id = a.message_id WHERE a.id = ? AND m.mailbox_id = ?
    `).get(id, mailboxId) as AttachmentRow | undefined;
  }

  deleteMailbox(id: string): string[] {
    const paths = this.connection.prepare(`
      SELECT a.storage_path FROM attachments a JOIN messages m ON m.id = a.message_id WHERE m.mailbox_id = ?
    `).all(id) as unknown as Array<{ storage_path: string }>;
    this.connection.prepare("DELETE FROM mailboxes WHERE id = ?").run(id);
    return paths.map((entry) => entry.storage_path);
  }

  expiredMailboxIds(now = new Date()): string[] {
    const rows = this.connection.prepare("SELECT id FROM mailboxes WHERE expires_at IS NOT NULL AND expires_at <= ?")
      .all(now.toISOString()) as unknown as Array<{ id: string }>;
    return rows.map((row) => row.id);
  }
}
