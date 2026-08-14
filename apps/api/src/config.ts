import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, isAbsolute, resolve } from "node:path";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
dotenv.config({ path: resolve(repositoryRoot, ".env") });

function numberFromEnv(name: string, fallback: number): number {
  const parsed = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${name} must be a positive number`);
  return parsed;
}

function localPath(value: string): string {
  return isAbsolute(value) ? value : resolve(repositoryRoot, value);
}

export interface AppConfig {
  nodeEnv: string;
  isDevelopment: boolean;
  appUrl: string;
  port: number;
  mailDomain: string;
  databasePath: string;
  defaultLifetime: number;
  storageLimitBytes: number;
  maxMessageBytes: number;
  maxAttachmentBytes: number;
  blockRemoteImages: boolean;
  allowDeletions: boolean;
  attachmentStoragePath: string;
  smtpHost: string;
  smtpPort: number;
  smtpUsername: string;
  smtpPassword: string;
  smtpTls: boolean;
}

export function loadConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  const nodeEnv = process.env.NODE_ENV ?? "development";
  const config: AppConfig = {
    nodeEnv,
    isDevelopment: nodeEnv !== "production",
    appUrl: process.env.APP_URL ?? "http://localhost:5173",
    port: numberFromEnv("API_PORT", 8787),
    mailDomain: (process.env.MAIL_DOMAIN ?? "mail.example.com").toLowerCase(),
    databasePath: localPath(process.env.DATABASE_URL ?? "./data/mail.db"),
    defaultLifetime: numberFromEnv("DEFAULT_MAILBOX_LIFETIME", 86400),
    storageLimitBytes: numberFromEnv("MAX_MAILBOX_STORAGE_MB", 25) * 1024 * 1024,
    maxMessageBytes: numberFromEnv("MAX_MESSAGE_SIZE_MB", 10) * 1024 * 1024,
    maxAttachmentBytes: numberFromEnv("MAX_ATTACHMENT_SIZE_MB", 5) * 1024 * 1024,
    blockRemoteImages: (process.env.BLOCK_REMOTE_IMAGES ?? "true") === "true",
    allowDeletions: (process.env.ALLOW_DELETIONS ?? "false") === "true",
    attachmentStoragePath: localPath(process.env.ATTACHMENT_STORAGE_PATH ?? "./storage/attachments"),
    smtpHost: process.env.SMTP_HOST ?? "",
    smtpPort: numberFromEnv("SMTP_PORT", 587),
    smtpUsername: process.env.SMTP_USERNAME ?? "",
    smtpPassword: process.env.SMTP_PASSWORD ?? "",
    smtpTls: (process.env.SMTP_TLS ?? "true") === "true",
  };
  return { ...config, ...overrides };
}
