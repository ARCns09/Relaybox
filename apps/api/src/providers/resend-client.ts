import {
  Resend,
} from "resend";

export interface ResendReceivedList { data: Array<{ id: string }>; hasMore: boolean }
export interface ResendReceivedEmail {
  id: string;
  to: string[];
  receivedFor: string[];
  from: string;
  createdAt: string;
  subject: string;
  cc: string[];
  replyTo: string[];
  html: string | null;
  text: string | null;
  headers: Record<string, string>;
  messageId: string;
  attachments: Array<{ id: string; filename: string | null; size: number; contentType: string }>;
}

export interface ResendInboundClient {
  listReceived(options?: { limit?: number; after?: string }): Promise<ResendReceivedList>;
  getReceived(id: string): Promise<ResendReceivedEmail>;
  getAttachment(emailId: string, attachmentId: string): Promise<{
    id: string;
    filename?: string | undefined;
    size: number;
    contentType: string;
    downloadUrl: string;
  }>;
}

export class OfficialResendInboundClient implements ResendInboundClient {
  private readonly resend: Resend;

  constructor(apiKey: string) { this.resend = new Resend(apiKey); }

  async listReceived(options: { limit?: number; after?: string } = {}): Promise<ResendReceivedList> {
    const response = await this.resend.emails.receiving.list(options);
    if (response.error || !response.data) throw new ResendClientError(response.error?.message ?? "Unable to list received emails.");
    return { data: response.data.data.map((email) => ({ id: email.id })), hasMore: response.data.has_more };
  }

  async getReceived(id: string): Promise<ResendReceivedEmail> {
    const response = await this.resend.emails.receiving.get(id, { html_format: "data_uri" });
    if (response.error || !response.data) throw new ResendClientError(response.error?.message ?? "Unable to retrieve received email.");
    return {
      id: response.data.id,
      to: response.data.to,
      receivedFor: response.data.received_for,
      from: response.data.from,
      createdAt: response.data.created_at,
      subject: response.data.subject,
      cc: response.data.cc ?? [],
      replyTo: response.data.reply_to ?? [],
      html: response.data.html,
      text: response.data.text,
      headers: response.data.headers ?? {},
      messageId: response.data.message_id,
      attachments: response.data.attachments.map((attachment) => ({
        id: attachment.id,
        filename: attachment.filename,
        size: attachment.size,
        contentType: attachment.content_type,
      })),
    };
  }

  async getAttachment(emailId: string, attachmentId: string) {
    const response = await this.resend.emails.receiving.attachments.get({ emailId, id: attachmentId });
    if (response.error || !response.data) throw new ResendClientError(response.error?.message ?? "Unable to retrieve received attachment.");
    return {
      id: response.data.id,
      filename: response.data.filename,
      size: response.data.size,
      contentType: response.data.content_type,
      downloadUrl: response.data.download_url,
    };
  }
}

export class ResendClientError extends Error {}
