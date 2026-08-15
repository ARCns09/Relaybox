import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Mailbox, Message } from "@relaybox/shared";
import { MessageViewer } from "./MessageViewer";

const mailbox: Mailbox = {
  id: "mailbox", address: "me@mail.test", alias: "me", domain: "mail.test", createdAt: "2026-01-01T00:00:00Z",
  expiresAt: null, lastAccessedAt: "2026-01-01T00:00:00Z", storageUsed: 0, storageLimit: 1024, isActive: true, unreadCount: 0,
};

function message(direction: "incoming" | "outgoing", id: string): Message {
  return {
    id, threadId: "thread", direction, deliveryStatus: direction === "incoming" ? "received" : "sent", messageId: `<${id}@mail.test>`,
    senderName: direction === "incoming" ? "Alice Example" : "me", senderEmail: direction === "incoming" ? "alice@example.com" : mailbox.address,
    recipients: direction === "incoming" ? [mailbox.address] : ["alice@example.com"], cc: [], replyTo: [], headers: {}, subject: "Project update",
    textBody: direction === "incoming" ? "Hello" : "Hi Alice", htmlBody: null, preview: "Preview", receivedAt: `2026-01-01T00:0${direction === "incoming" ? "0" : "1"}:00Z`,
    isRead: true, hasAttachments: false, attachments: [], size: 8, logo: { kind: "generated", value: "AE", background: "#7657ff" },
  };
}

describe("conversation viewer", () => {
  it("renders received and sent messages on distinct chat sides with inline compose", () => {
    const html = renderToStaticMarkup(<MessageViewer thread={[message("incoming", "one"), message("outgoing", "two")]} selectedId="one"
      mailbox={mailbox} loading={false} defaultHtml={false} blockRemoteImages expired={false} outboundConfigured
      onBack={vi.fn()} onDelete={vi.fn()} onSend={vi.fn()} onRetry={vi.fn()} onDownload={vi.fn()} />);
    expect(html).toContain("chat-row incoming");
    expect(html).toContain("chat-row outgoing");
    expect(html).toContain("Email details");
    expect(html).toContain("Send reply");
    expect(html).toContain("Sent");
  });

  it("makes compose read-only when the mailbox is expired", () => {
    const html = renderToStaticMarkup(<MessageViewer thread={[message("incoming", "one")]} selectedId="one" mailbox={mailbox}
      loading={false} defaultHtml={false} blockRemoteImages expired outboundConfigured onBack={vi.fn()} onDelete={vi.fn()}
      onSend={vi.fn()} onRetry={vi.fn()} onDownload={vi.fn()} />);
    expect(html).toContain("This mailbox has expired. Replies are disabled.");
    expect(html).toContain("This conversation is read-only");
    expect(html).toContain("disabled");
  });
});
