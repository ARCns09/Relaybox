export type LifetimePreset = 600 | 3600 | 86400 | 604800 | 2592000 | null;

export interface Mailbox {
  id: string;
  address: string;
  alias: string;
  domain: string;
  createdAt: string;
  expiresAt: string | null;
  lastAccessedAt: string;
  storageUsed: number;
  storageLimit: number;
  isActive: boolean;
  unreadCount: number;
}

export interface MailboxCredential { mailbox: Mailbox; token: string }

export interface SenderLogo {
  kind: "brand" | "favicon" | "generated";
  value: string;
  background?: string;
}

export interface MessageSummary {
  id: string;
  senderName: string;
  senderEmail: string;
  subject: string;
  preview: string;
  receivedAt: string;
  isRead: boolean;
  hasAttachments: boolean;
  size: number;
  logo: SenderLogo;
}

export interface Attachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
}

export interface Message extends MessageSummary {
  recipients: string[];
  textBody: string;
  htmlBody: string | null;
  messageId: string;
  attachments: Attachment[];
}

export interface ApiError { error: string; details?: string[] }

export interface CreateMailboxInput {
  alias?: string;
  lifetimeSeconds: number | null;
}

export interface InjectEmailInput {
  to: string;
  senderName?: string;
  senderEmail: string;
  subject?: string;
  textBody?: string;
  htmlBody?: string;
  attachments?: Array<{ filename: string; mimeType?: string; contentBase64: string }>;
}

export type RealtimeEvent =
  | { type: "connected" }
  | { type: "message:new"; message: MessageSummary }
  | { type: "mailbox:expired" }
  | { type: "mailbox:deleted" };

export const LIFETIME_OPTIONS = [
  { label: "10 minutes", value: 600 },
  { label: "1 hour", value: 3600 },
  { label: "24 hours", value: 86400 },
  { label: "7 days", value: 604800 },
  { label: "30 days", value: 2592000 },
  { label: "Never expires", value: null },
] as const;
