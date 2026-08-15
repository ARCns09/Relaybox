import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Mailbox } from "@relaybox/shared";
import { Sidebar } from "./Sidebar";
import { InboxPanel } from "./InboxPanel";

const expired: Mailbox = {
  id: "expired-id",
  address: "finished@mail.test",
  alias: "finished",
  domain: "mail.test",
  createdAt: "2026-01-01T00:00:00Z",
  expiresAt: "2026-01-01T00:10:00Z",
  lastAccessedAt: "2026-01-01T00:00:00Z",
  storageUsed: 0,
  storageLimit: 1024,
  isActive: true,
  unreadCount: 0,
};

describe("expired mailbox UX", () => {
  it("labels the mailbox as expired and exposes only its removal action", () => {
    const noop = vi.fn();
    const html = renderToStaticMarkup(<Sidebar mailboxes={[expired]} active={expired} copied={false}
      now={new Date("2026-01-01T00:10:00Z").getTime()} open={false} onClose={noop} onSelect={noop}
      onCopy={noop} onCreate={noop} onDelete={noop} onSettings={noop} />);
    expect(html).toContain("Expired mailbox");
    expect(html).toContain("Remove expired mailbox");
    expect(html).not.toContain("status-dot\"></span> Active mailbox");
    expect(html).toContain("disabled");
  });

  it("disables inbox controls and shows the expired empty state", () => {
    const noop = vi.fn();
    const html = renderToStaticMarkup(<InboxPanel messages={[]} search="" sort="newest" loading={false}
      mailboxStatus="expired" development={false} onMenu={noop} onSearch={noop} onSort={noop}
      onRefresh={noop} onSelect={noop} onCreate={noop} onDemo={noop} />);
    expect(html).toContain("This mailbox has expired");
    expect(html).toContain("Message access has stopped");
    expect((html.match(/disabled/g) ?? [])).toHaveLength(3);
  });
});
