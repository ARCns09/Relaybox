import type { CreateMailboxInput, InjectEmailInput, Mailbox, MailboxCredential, Message, MessageSummary } from "@relaybox/shared";

const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";

export class ApiClientError extends Error {
  constructor(readonly status: number, message: string, readonly details: string[] = []) { super(message); }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText })) as { error?: string; details?: string[] };
    throw new ApiClientError(response.status, body.error ?? "Request failed", body.details ?? []);
  }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const mailboxPath = (address: string) => `/api/mailboxes/${encodeURIComponent(address)}`;

export const api = {
  health: () => request<{ status: string; mailDomain: string; defaultLifetime: number; storageLimit: number; outboundConfigured: boolean; isDevelopment: boolean }>("/api/health"),
  createMailbox: (input: CreateMailboxInput) => request<MailboxCredential>("/api/mailboxes", { method: "POST", body: JSON.stringify(input) }),
  mailbox: (credential: Pick<MailboxCredential, "token"> & { address: string }) =>
    request<{ mailbox: Mailbox }>(mailboxPath(credential.address), { headers: auth(credential.token) }),
  messages: (address: string, token: string) => request<{ messages: MessageSummary[]; mailbox: Mailbox }>(`${mailboxPath(address)}/messages`, { headers: auth(token) }),
  message: (address: string, token: string, id: string) => request<{ message: Message }>(`${mailboxPath(address)}/messages/${id}`, { headers: auth(token) }),
  markRead: (address: string, token: string, id: string, isRead = true) => request<{ message: Message }>(`${mailboxPath(address)}/messages/${id}`, {
    method: "PATCH", headers: auth(token), body: JSON.stringify({ isRead }),
  }),
  reply: (address: string, token: string, input: { to: string; subject: string; textBody: string }) => request<{ messageId: string }>(`${mailboxPath(address)}/reply`, {
    method: "POST", headers: auth(token), body: JSON.stringify(input),
  }),
  inject: (input: InjectEmailInput) => request<{ message: MessageSummary }>("/api/dev/inject-email", { method: "POST", body: JSON.stringify(input) }),
  eventsUrl: (address: string) => `${API_URL}${mailboxPath(address)}/events`,
  attachmentUrl: (address: string, id: string) => `${API_URL}${mailboxPath(address)}/attachments/${id}`,
};

export async function downloadAttachment(address: string, token: string, id: string, filename: string): Promise<void> {
  const response = await fetch(api.attachmentUrl(address, id), { headers: auth(token) });
  if (!response.ok) throw new ApiClientError(response.status, "Attachment download failed.");
  const objectUrl = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}
