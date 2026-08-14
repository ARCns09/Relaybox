import nodemailer from "nodemailer";
import type { AppConfig } from "./config.js";
import { sanitizeEmailHtml } from "./sanitizer.js";

export interface ReplyInput { to: string; subject: string; textBody: string; htmlBody?: string }

export class OutboundService {
  constructor(private readonly config: AppConfig) {}

  get configured(): boolean { return Boolean(this.config.smtpHost); }

  async send(from: string, input: ReplyInput): Promise<string> {
    if (!this.config.smtpHost) throw new OutboundError(503, "Outbound SMTP is not configured.");
    if (!/^\S+@\S+\.\S+$/.test(input.to)) throw new OutboundError(400, "A valid recipient is required.");
    if (!input.textBody.trim() && !input.htmlBody?.trim()) throw new OutboundError(400, "A reply body is required.");
    const transport = nodemailer.createTransport({
      host: this.config.smtpHost,
      port: this.config.smtpPort,
      secure: this.config.smtpPort === 465,
      requireTLS: this.config.smtpTls && this.config.smtpPort !== 465,
      ...(this.config.smtpUsername ? { auth: { user: this.config.smtpUsername, pass: this.config.smtpPassword } } : {}),
    });
    const result = await transport.sendMail({
      from,
      to: input.to,
      subject: input.subject.slice(0, 240),
      text: input.textBody,
      ...(input.htmlBody ? { html: sanitizeEmailHtml(input.htmlBody, false) } : {}),
    });
    return result.messageId;
  }
}

export class OutboundError extends Error {
  constructor(readonly statusCode: number, message: string) { super(message); }
}
