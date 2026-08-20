import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { initialPlatformState } from "../platform";
import { AdminDashboard } from "./AdminDashboard";
import { CreateMailboxModal } from "./CreateMailboxModal";
import { DomainDirectory } from "./DomainDirectory";
import { LoginPage } from "./LoginPage";
import { Sidebar } from "./Sidebar";

describe("invite-only platform UI", () => {
  it("offers login without public registration", () => {
    const html = renderToStaticMarkup(<LoginPage users={initialPlatformState.users} onLogin={vi.fn()} />);
    expect(html).toContain("Sign in to Relaybox");
    expect(html).toContain("No public signup is available");
    expect(html).not.toContain("Register");
    expect(html).not.toContain("Create Account");
  });

  it("shows practical admin storage data and an invitation action", () => {
    const html = renderToStaticMarkup(<AdminDashboard currentUser={initialPlatformState.users[0]!} state={initialPlatformState} onChange={vi.fn()} onBackToInbox={vi.fn()} onMenu={vi.fn()} onToast={vi.fn()} />);
    expect(html).toContain("Relaybox capacity");
    expect(html).toContain("Allocated");
    expect(html).toContain("Actually used");
    expect(html).toContain("Invite member");
    expect(html).toContain("Members");
  });

  it("blocks mailbox creation when the server exposes no public domain", () => {
    const html = renderToStaticMarkup(<CreateMailboxModal domains={[]} defaultLifetime={86400} onClose={vi.fn()} onCreate={vi.fn()} />);
    expect(html).toContain("No public domain available");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>.*Create mailbox/s);
  });

  it("shows public domain availability to members without exposing reserved domains", () => {
    const html = renderToStaticMarkup(<DomainDirectory domains={initialPlatformState.domains} onBackToInbox={vi.fn()} onMenu={vi.fn()} />);
    expect(html).toContain("Available domains");
    expect(html).toContain("relaybox.ryzn.pro");
    expect(html).toContain("mail.arcn.online");
    expect(html).toContain("upcoming");
    expect(html).not.toContain("arc@arcn.online");
  });

  it("keeps domain navigation member-only because admins manage domains in Admin", () => {
    const noop = vi.fn();
    const renderSidebar = (userIndex: number) => renderToStaticMarkup(<Sidebar mailboxes={[]} copied={false} now={Date.now()} open={false} user={initialPlatformState.users[userIndex]!} onClose={noop} onSelect={noop} onCopy={noop} onCreate={noop} onDelete={noop} onSettings={noop} onMail={noop} onDomains={noop} onAdmin={noop} onLogout={noop} />);
    expect(renderSidebar(1)).toContain("Domains");
    expect(renderSidebar(0)).not.toContain("Domains");
    expect(renderSidebar(0)).toContain("Admin");
  });
});
