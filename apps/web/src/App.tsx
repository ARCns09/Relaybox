import { useCallback, useEffect, useState } from "react";
import type { Mailbox, Message, MessageSummary, RealtimeEvent } from "@relaybox/shared";
import { api, ApiClientError, downloadAttachment } from "./api";
import { loadCredentials, loadSettings, saveCredentials, saveSettings, type Settings, type StoredCredential } from "./storage";
import { useRealtime } from "./useRealtime";
import { Sidebar } from "./components/Sidebar";
import { InboxPanel } from "./components/InboxPanel";
import { MessageViewer } from "./components/MessageViewer";
import { CreateMailboxModal } from "./components/CreateMailboxModal";
import { SettingsModal } from "./components/SettingsModal";
import { Toast } from "./components/Toast";
import { LoginPage } from "./components/LoginPage";
import { AdminDashboard } from "./components/AdminDashboard";
import { loadPlatformState, loadPreviewSession, savePlatformState, savePreviewSession, type PlatformState, type PlatformUser } from "./platform";
import { isMailboxExpired } from "./utils";

interface Health {
  mailDomain: string; mailDomains: string[]; publicMailboxDomains?: string[]; reservedMailboxes?: string[]; defaultLifetime: number; storageLimit: number; outboundConfigured: boolean; isDevelopment: boolean;
}

export function App() {
  const [platform, setPlatform] = useState<PlatformState>(loadPlatformState);
  const [sessionUserId, setSessionUserId] = useState<string | undefined>(loadPreviewSession);
  const currentUser = platform.users.find((user) => user.id === sessionUserId && user.status === "active");

  useEffect(() => savePlatformState(platform), [platform]);

  const login = async (email: string, password: string) => {
    await new Promise((resolve) => window.setTimeout(resolve, 450));
    const user = platform.users.find((candidate) => candidate.email.toLowerCase() === email.trim().toLowerCase());
    if (!user) throw new Error("This account has not been invited to Relaybox.");
    if (user.status !== "active") throw new Error("This account is disabled. Contact the administrator.");
    if (!password) throw new Error("Enter your password.");
    savePreviewSession(user.id);
    setSessionUserId(user.id);
  };

  if (!currentUser) return <LoginPage users={platform.users} onLogin={login} />;

  return <MailboxWorkspace currentUser={currentUser} platform={platform} onPlatformChange={setPlatform} onLogout={() => {
    savePreviewSession(undefined);
    setSessionUserId(undefined);
  }} />;
}

function MailboxWorkspace({ currentUser, platform, onPlatformChange, onLogout }: { currentUser: PlatformUser; platform: PlatformState; onPlatformChange(state: PlatformState): void; onLogout(): void }) {
  const [credentials, setCredentials] = useState<StoredCredential[]>(loadCredentials);
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [activeAddress, setActiveAddress] = useState(() => loadCredentials()[0]?.address ?? "");
  const [messages, setMessages] = useState<MessageSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [thread, setThread] = useState<Message[]>([]);
  const [loadingInbox, setLoadingInbox] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState(false);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest" | "sender">("newest");
  const [health, setHealth] = useState<Health>({ mailDomain: "mail.example.com", mailDomains: ["mail.example.com"], defaultLifetime: 86400, storageLimit: 25 * 1024 ** 2, outboundConfigured: false, isDevelopment: false });
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [createOpen, setCreateOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mobileView, setMobileView] = useState<"inbox" | "message">("inbox");
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" }>();
  const [workspaceView, setWorkspaceView] = useState<"mail" | "admin">("mail");

  const active = mailboxes.find((mailbox) => mailbox.address === activeAddress);
  const credential = credentials.find((item) => item.address === activeAddress);
  const activeExpired = Boolean(active && isMailboxExpired(active, now));
  const activeUsable = Boolean(active && credential && !activeExpired);
  const mailboxStatus = !active ? "none" as const : activeExpired ? "expired" as const : "active" as const;
  const activeThreadId = thread[0]?.threadId;

  const showError = useCallback((error: unknown) => {
    const message = error instanceof ApiClientError
      ? [error.message, ...error.details].join(" ")
      : error instanceof Error ? error.message : "Something went wrong.";
    setToast({ message, tone: "error" });
  }, []);

  const removeLocalMailbox = useCallback((address: string) => {
    setCredentials((current) => {
      const next = current.filter((item) => item.address !== address);
      saveCredentials(next);
      return next;
    });
    setMailboxes((current) => current.filter((item) => item.address !== address));
    setActiveAddress((current) => current === address ? "" : current);
  }, []);

  useEffect(() => {
    void api.health().then(setHealth).catch(showError);
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [showError]);

  useEffect(() => {
    const hydrate = async () => {
      const valid: StoredCredential[] = [];
      const resolved: Mailbox[] = [];
      await Promise.all(credentials.map(async (item) => {
        try {
          const result = await api.mailbox(item);
          valid.push(item); resolved.push(result.mailbox);
        } catch (error) {
          if (error instanceof ApiClientError && error.status === 410) valid.push(item);
          else if (!(error instanceof ApiClientError) || ![401, 404].includes(error.status)) showError(error);
        }
      }));
      setMailboxes(resolved.sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
      if (valid.length !== credentials.length) { setCredentials(valid); saveCredentials(valid); }
      if (!valid.some((item) => item.address === activeAddress)) setActiveAddress(valid[0]?.address ?? "");
    };
    void hydrate();
    // Credentials are intentionally hydrated only when their membership changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [credentials.length, showError]);

  const refreshInbox = useCallback(async () => {
    if (!credential || activeExpired) { setMessages([]); return; }
    setLoadingInbox(true);
    try {
      const result = await api.messages(credential.address, credential.token);
      setMessages(result.messages);
      setMailboxes((current) => current.map((item) => item.address === result.mailbox.address ? result.mailbox : item));
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 410) {
        setMailboxes((current) => current.map((item) => item.address === credential.address ? { ...item, isActive: false } : item));
      } else if (error instanceof ApiClientError && [401, 404].includes(error.status)) removeLocalMailbox(credential.address);
      else showError(error);
    }
    finally { setLoadingInbox(false); }
  }, [activeExpired, credential, removeLocalMailbox, showError]);

  useEffect(() => {
    setSelectedId(undefined); setThread([]); setMobileView("inbox"); setSearch("");
  }, [activeAddress]);

  useEffect(() => {
    void refreshInbox();
  }, [activeAddress, refreshInbox]);

  useEffect(() => {
    if (!activeExpired) return;
    setMessages([]);
  }, [activeAddress, activeExpired]);

  const expiredAddresses = mailboxes.filter((mailbox) => isMailboxExpired(mailbox, now)).map((mailbox) => mailbox.address).sort().join("|");
  useEffect(() => {
    if (!expiredAddresses) return;
    const addresses = expiredAddresses.split("|");
    const reconcile = async () => {
      await Promise.all(addresses.map(async (address) => {
        const item = credentials.find((candidate) => candidate.address === address);
        if (!item) return;
        try {
          const result = await api.mailbox(item);
          setMailboxes((current) => current.map((mailbox) => mailbox.address === address ? result.mailbox : mailbox));
        } catch (error) {
          if (error instanceof ApiClientError && [401, 404].includes(error.status)) removeLocalMailbox(address);
          // 410 means cleanup has not removed the expired row yet; keep its temporary expired state.
        }
      }));
    };
    void reconcile();
    const timer = window.setInterval(() => void reconcile(), 5000);
    return () => clearInterval(timer);
  }, [credentials, expiredAddresses, removeLocalMailbox]);

  useEffect(() => {
    const theme = settings.theme === "system" ? (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark") : settings.theme;
    document.documentElement.dataset.theme = theme;
  }, [settings.theme]);

  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(undefined), 4500);
    return () => clearTimeout(timeout);
  }, [toast]);

  const realtimeHandler = useCallback((event: RealtimeEvent) => {
    if (event.type === "message:new") {
      setMessages((current) => [event.message, ...current.filter((item) => item.id !== event.message.id)]);
      setMailboxes((current) => current.map((item) => item.address === activeAddress ? { ...item, unreadCount: item.unreadCount + 1, storageUsed: item.storageUsed + event.message.size } : item));
      setToast({ message: `New message from ${event.message.senderName}`, tone: "success" });
      if (settings.browserNotifications && Notification.permission === "granted") new Notification(event.message.senderName, { body: event.message.subject });
      if (settings.sound) playNotificationSound();
    }
    if ((event.type === "message:new" || event.type === "message:sent") && event.message.threadId === activeThreadId && credential) {
      void api.thread(credential.address, credential.token, event.message.id).then((result) => setThread(result.thread)).catch(() => undefined);
    }
    if (event.type === "mailbox:expired" || event.type === "mailbox:deleted") removeLocalMailbox(activeAddress);
  }, [activeAddress, activeThreadId, credential, removeLocalMailbox, settings.browserNotifications, settings.sound]);
  useRealtime(activeUsable ? activeAddress : undefined, activeUsable ? credential?.token : undefined, realtimeHandler);

  const createMailbox = async (alias: string | undefined, lifetimeSeconds: number | null, domain: string) => {
    try {
      const result = await api.createMailbox({ ...(alias ? { alias } : {}), domain, lifetimeSeconds });
      const nextCredentials = [...credentials, { address: result.mailbox.address, token: result.token }];
      setCredentials(nextCredentials); saveCredentials(nextCredentials);
      setMailboxes((current) => [...current, result.mailbox]);
      setActiveAddress(result.mailbox.address); setCreateOpen(false);
      if (settings.autoCopy) await navigator.clipboard.writeText(result.mailbox.address);
      setToast({ message: settings.autoCopy ? "Mailbox created and address copied." : "Mailbox created.", tone: "success" });
    } catch (error) { showError(error); }
  };

  const copyAddress = async () => {
    if (!active || activeExpired) return;
    await navigator.clipboard.writeText(active.address);
    setCopied(true); setTimeout(() => setCopied(false), 1400);
  };

  const deleteMailbox = async () => {
    if (!active || !credential || !window.confirm(activeExpired ? `Remove expired mailbox ${active.address}?` : `Permanently delete ${active.address} and every message in it?`)) return;
    try {
      await api.deleteMailbox(active.address, credential.token);
      removeLocalMailbox(active.address);
      setMessages([]); setThread([]); setSelectedId(undefined);
      setToast({ message: activeExpired ? "Expired mailbox removed." : "Mailbox permanently deleted.", tone: "success" });
    } catch (error) {
      if (activeExpired && error instanceof ApiClientError && [404, 410].includes(error.status)) {
        removeLocalMailbox(active.address);
        setToast({ message: "Expired mailbox removed from this device.", tone: "success" });
      } else showError(error);
    }
  };

  const openMessage = async (id: string) => {
    if (!credential || activeExpired) return;
    setSelectedId(id); setLoadingMessage(true); setMobileView("message");
    try {
      const result = await api.thread(credential.address, credential.token, id);
      setThread(result.thread);
      const opened = result.thread.find((item) => item.id === id);
      if (settings.autoMarkRead && opened && !opened.isRead) {
        await api.markRead(credential.address, credential.token, id);
        setMessages((current) => current.map((item) => item.id === id ? { ...item, isRead: true } : item));
        setMailboxes((current) => current.map((item) => item.address === credential.address ? { ...item, unreadCount: Math.max(0, item.unreadCount - 1) } : item));
      }
    } catch (error) { showError(error); }
    finally { setLoadingMessage(false); }
  };

  const deleteMessage = async () => {
    if (!credential || activeExpired || !selectedId || !window.confirm("Permanently delete this message?")) return;
    try {
      await api.deleteMessage(credential.address, credential.token, selectedId);
      setMessages((current) => current.filter((item) => item.id !== selectedId));
      setThread((current) => {
        const next = current.filter((item) => item.id !== selectedId);
        setSelectedId(next.at(-1)?.id);
        if (!next.length) setMobileView("inbox");
        return next;
      });
      setToast({ message: "Message permanently deleted.", tone: "success" });
      void refreshInbox();
    } catch (error) { showError(error); }
  };

  const injectDemo = async () => {
    if (!active || activeExpired) return;
    try {
      await api.inject({
        to: active.address, senderName: "Relaybox Studio", senderEmail: "hello@github.com", subject: "Your private inbox is live",
        textBody: "Everything is working. New messages arrive instantly, and this mailbox belongs only to this browser.",
        htmlBody: `<div style="max-width:560px;margin:auto"><p style="color:#7657ff;font-weight:bold">RELAYBOX / DELIVERY CHECK</p><h1>Your private inbox is live.</h1><p>Everything is working. New messages arrive instantly, and this mailbox belongs only to this browser.</p><img src="https://images.unsplash.com/photo-1557682250-33bd709cbe85?w=600" alt="Remote test image"><p><a href="https://example.com">Test a safe external link</a></p></div>`,
      });
    } catch (error) { showError(error); }
  };

  const savePreferences = async (next: Settings) => {
    if (next.browserNotifications && Notification.permission === "default") {
      const permission = await Notification.requestPermission();
      next = { ...next, browserNotifications: permission === "granted" };
    }
    setSettings(next); saveSettings(next); setSettingsOpen(false); setToast({ message: "Preferences saved.", tone: "success" });
  };

  const sendReply = async (input: { to: string; subject: string; textBody: string; replyToMessageId: string }, existingId?: string) => {
    if (!credential || !active || activeExpired) throw new Error("This mailbox can no longer send replies.");
    const optimisticId = existingId ?? `pending-${crypto.randomUUID()}`;
    const optimistic: Message = {
      id: optimisticId, messageId: "", threadId: thread[0]?.threadId ?? optimisticId, direction: "outgoing", deliveryStatus: "sending",
      senderName: active.alias, senderEmail: active.address, recipients: [input.to], cc: [], replyTo: [], headers: {}, subject: input.subject,
      textBody: input.textBody, htmlBody: null, preview: input.textBody.slice(0, 160), receivedAt: new Date().toISOString(), isRead: true,
      hasAttachments: false, attachments: [], size: new Blob([input.textBody]).size,
      logo: { kind: "generated", value: active.alias.slice(0, 2).toUpperCase(), background: "#7657ff" },
    };
    setThread((current) => existingId ? current.map((item) => item.id === existingId ? optimistic : item) : [...current, optimistic]);
    try {
      const result = await api.reply(credential.address, credential.token, input);
      setThread((current) => current.map((item) => item.id === optimisticId ? result.message : item));
      setToast({ message: "Reply sent and saved to the conversation.", tone: "success" });
    } catch (error) {
      setThread((current) => current.map((item) => item.id === optimisticId ? { ...item, deliveryStatus: "failed" } : item));
      showError(error);
      throw error;
    }
  };

  const retryReply = async (failed: Message) => {
    const target = [...thread].reverse().find((item) => item.direction === "incoming");
    if (!target) return;
    try {
      await sendReply({ to: failed.recipients[0] ?? target.senderEmail, subject: failed.subject, textBody: failed.textBody, replyToMessageId: target.id }, failed.id);
    } catch { /* The failed bubble and toast already expose the retryable error. */ }
  };

  const publicCreationDomains = (() => {
    const reservedDomains = new Set(platform.domains.filter((domain) => domain.visibility === "reserved" || !domain.allowMailboxCreation).map((domain) => domain.domain));
    const candidates = health.publicMailboxDomains?.length ? health.publicMailboxDomains : health.mailDomains;
    return candidates.filter((domain) => !reservedDomains.has(domain));
  })();

  const updateCurrentUser = (updater: (user: PlatformUser) => PlatformUser) => {
    onPlatformChange({ ...platform, users: platform.users.map((user) => user.id === currentUser.id ? updater(user) : user) });
  };

  return <main className={`app-shell ${workspaceView === "admin" ? "admin-app-shell" : ""}`} data-mobile-view={mobileView}>
    <div className={`sidebar-scrim ${sidebarOpen ? "show" : ""}`} onClick={() => setSidebarOpen(false)} />
    <Sidebar mailboxes={mailboxes} active={active} copied={copied} now={now} open={sidebarOpen} onClose={() => setSidebarOpen(false)}
      user={currentUser} view={workspaceView} onMail={() => { setWorkspaceView("mail"); setSidebarOpen(false); }} onAdmin={() => { setWorkspaceView("admin"); setSidebarOpen(false); }} onLogout={onLogout}
      onSelect={(address) => { setActiveAddress(address); setWorkspaceView("mail"); setSidebarOpen(false); }} onCopy={copyAddress} onCreate={() => setCreateOpen(true)} onDelete={deleteMailbox} onSettings={() => setSettingsOpen(true)} />
    {workspaceView === "admin" && currentUser.role === "admin" ? <AdminDashboard currentUser={currentUser} state={platform} onChange={onPlatformChange} onBackToInbox={() => setWorkspaceView("mail")} onMenu={() => setSidebarOpen(true)} onToast={(message, tone = "success") => setToast({ message, tone })} /> : <><InboxPanel messages={messages} selectedId={selectedId} search={search} sort={sort} loading={loadingInbox} mailboxStatus={mailboxStatus} development={health.isDevelopment}
      onMenu={() => setSidebarOpen(true)} onSearch={setSearch} onSort={setSort} onRefresh={refreshInbox} onSelect={openMessage} onCreate={() => setCreateOpen(true)} onDemo={injectDemo} />
    <MessageViewer thread={thread} selectedId={selectedId} mailbox={active} loading={loadingMessage} defaultHtml={settings.defaultHtml} blockRemoteImages={settings.blockRemoteImages}
      expired={activeExpired} outboundConfigured={health.outboundConfigured} onBack={() => setMobileView("inbox")} onDelete={deleteMessage} onSend={sendReply} onRetry={retryReply}
      onDownload={(id, filename) => activeUsable && credential && void downloadAttachment(credential.address, credential.token, id, filename).catch(showError)} /></>}
    {createOpen && <CreateMailboxModal domains={publicCreationDomains} defaultLifetime={settings.defaultLifetime} onClose={() => setCreateOpen(false)} onCreate={createMailbox} />}
    {settingsOpen && <SettingsModal value={settings} user={currentUser} onClose={() => setSettingsOpen(false)} onSave={savePreferences}
      onProfile={(displayName) => { updateCurrentUser((user) => ({ ...user, displayName })); setToast({ message: "Profile updated in this frontend preview.", tone: "success" }); }}
      onChangePassword={() => setToast({ message: "Password change is ready for the future account API.", tone: "success" })}
      onOpenAdmin={currentUser.role === "admin" ? () => { setSettingsOpen(false); setWorkspaceView("admin"); } : undefined} />}
    {toast && <Toast {...toast} onClose={() => setToast(undefined)} />}
  </main>;
}

function playNotificationSound(): void {
  const AudioContextClass = window.AudioContext;
  const context = new AudioContextClass();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.frequency.value = 660; gain.gain.setValueAtTime(0.04, context.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.18);
  oscillator.connect(gain).connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + 0.18);
}
