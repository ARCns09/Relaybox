import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { initialPlatformState } from "../platform";
import { AdminDashboard } from "./AdminDashboard";
import { CreateMailboxModal } from "./CreateMailboxModal";
import { LoginPage } from "./LoginPage";

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
});
