import { useCallback, useEffect, useMemo, useState } from "react";
import type { Mailbox, Message, MessageSummary, RealtimeEvent } from "@relaybox/shared";
import { api, ApiClientError, downloadAttachment } from "./api";
import { loadCredentials, loadSettings, saveCredentials, saveSettings, type Settings, type StoredCredential } from "./storage";
import { useRealtime } from "./useRealtime";
import { Sidebar } from "./components/Sidebar";
import { InboxPanel } from "./components/InboxPanel";
import { MessageViewer } from "./components/MessageViewer";
import { CreateMailboxModal } from "./components/CreateMailboxModal";
import { SettingsModal } from "./components/SettingsModal";
import { ReplyModal } from "./components/ReplyModal";
import { Toast } from "./components/Toast";

interface Health {
  mailDomain: string; mailDomains: string[]; defaultLifetime: number; storageLimit: number; outboundConfigured: boolean; isDevelopment: boolean;
}

export function App() {
  const [credentials, setCredentials] = useState<StoredCredential[]>(loadCredentials);
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [activeAddress, setActiveAddress] = useState(() => loadCredentials()[0]?.address ?? "");
  const [messages, setMessages] = useState<MessageSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [message, setMessage] = useState<Message>();
  const [loadingInbox, setLoadingInbox] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState(false);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest" | "sender">("newest");
  const [health, setHealth] = useState<Health>({ mailDomain: "mail.example.com", mailDomains: ["mail.example.com"], defaultLifetime: 86400, storageLimit: 25 * 1024 ** 2, outboundConfigured: false, isDevelopment: false });
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [createOpen, setCreateOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mobileView, setMobileView] = useState<"inbox" | "message">("inbox");
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" }>();

  const active = mailboxes.find((mailbox) => mailbox.address === activeAddress);
  const credential = credentials.find((item) => item.address === activeAddress);

  const showError = useCallback((error: unknown) => {
    const message = error instanceof ApiClientError
      ? [error.message, ...error.details].join(" ")
      : error instanceof Error ? error.message : "Something went wrong.";
    setToast({ message, tone: "error" });
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
          if (!(error instanceof ApiClientError) || ![401, 404, 410].includes(error.status)) showError(error);
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
    if (!credential) { setMessages([]); return; }
    setLoadingInbox(true);
    try {
      const result = await api.messages(credential.address, credential.token);
      setMessages(result.messages);
      setMailboxes((current) => current.map((item) => item.address === result.mailbox.address ? result.mailbox : item));
    } catch (error) { showError(error); }
    finally { setLoadingInbox(false); }
  }, [credential, showError]);

  useEffect(() => {
    setSelectedId(undefined); setMessage(undefined); setMobileView("inbox"); setSearch("");
    void refreshInbox();
  }, [activeAddress, refreshInbox]);

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
    if (event.type === "mailbox:expired" || event.type === "mailbox:deleted") removeLocalMailbox(activeAddress);
  }, [activeAddress, settings.browserNotifications, settings.sound]);
  useRealtime(activeAddress || undefined, credential?.token, realtimeHandler);

  const removeLocalMailbox = useCallback((address: string) => {
    setCredentials((current) => {
      const next = current.filter((item) => item.address !== address); saveCredentials(next); return next;
    });
    setMailboxes((current) => current.filter((item) => item.address !== address));
    setActiveAddress((current) => current === address ? credentials.find((item) => item.address !== address)?.address ?? "" : current);
  }, [credentials]);

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
    if (!active) return;
    await navigator.clipboard.writeText(active.address);
    setCopied(true); setTimeout(() => setCopied(false), 1400);
  };

  const deleteMailbox = async () => {
    if (!active || !credential || !window.confirm(`Permanently delete ${active.address} and every message in it?`)) return;
    try {
      await api.deleteMailbox(active.address, credential.token);
      removeLocalMailbox(active.address);
      setMessages([]); setMessage(undefined); setSelectedId(undefined);
      setToast({ message: "Mailbox permanently deleted.", tone: "success" });
    } catch (error) { showError(error); }
  };

  const openMessage = async (id: string) => {
    if (!credential) return;
    setSelectedId(id); setLoadingMessage(true); setMobileView("message");
    try {
      const result = await api.message(credential.address, credential.token, id);
      setMessage(result.message);
      if (settings.autoMarkRead && !result.message.isRead) {
        await api.markRead(credential.address, credential.token, id);
        setMessages((current) => current.map((item) => item.id === id ? { ...item, isRead: true } : item));
        setMailboxes((current) => current.map((item) => item.address === credential.address ? { ...item, unreadCount: Math.max(0, item.unreadCount - 1) } : item));
      }
    } catch (error) { showError(error); }
    finally { setLoadingMessage(false); }
  };

  const deleteMessage = async () => {
    if (!credential || !selectedId || !window.confirm("Permanently delete this message?")) return;
    try {
      await api.deleteMessage(credential.address, credential.token, selectedId);
      setMessages((current) => current.filter((item) => item.id !== selectedId));
      setMessage(undefined); setSelectedId(undefined); setMobileView("inbox");
      setToast({ message: "Message permanently deleted.", tone: "success" });
      void refreshInbox();
    } catch (error) { showError(error); }
  };

  const injectDemo = async () => {
    if (!active) return;
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

  const sendReply = async (input: { to: string; subject: string; textBody: string }) => {
    if (!credential) return;
    try { await api.reply(credential.address, credential.token, input); setReplyOpen(false); setToast({ message: "Reply handed to your SMTP server.", tone: "success" }); }
    catch (error) { showError(error); }
  };

  const selectedMessage = useMemo(() => message?.id === selectedId ? message : undefined, [message, selectedId]);

  return <main className="app-shell" data-mobile-view={mobileView}>
    <div className={`sidebar-scrim ${sidebarOpen ? "show" : ""}`} onClick={() => setSidebarOpen(false)} />
    <Sidebar mailboxes={mailboxes} active={active} copied={copied} now={now} open={sidebarOpen} onClose={() => setSidebarOpen(false)}
      onSelect={(address) => { setActiveAddress(address); setSidebarOpen(false); }} onCopy={copyAddress} onCreate={() => setCreateOpen(true)} onDelete={deleteMailbox} onSettings={() => setSettingsOpen(true)} />
    <InboxPanel messages={messages} selectedId={selectedId} search={search} sort={sort} loading={loadingInbox} hasMailbox={Boolean(active)} development={health.isDevelopment}
      onMenu={() => setSidebarOpen(true)} onSearch={setSearch} onSort={setSort} onRefresh={refreshInbox} onSelect={openMessage} onCreate={() => setCreateOpen(true)} onDemo={injectDemo} />
    <MessageViewer message={selectedMessage} loading={loadingMessage} defaultHtml={settings.defaultHtml} blockRemoteImages={settings.blockRemoteImages}
      onBack={() => setMobileView("inbox")} onReply={() => setReplyOpen(true)} onDelete={deleteMessage}
      onDownload={(id, filename) => credential && void downloadAttachment(credential.address, credential.token, id, filename).catch(showError)} />
    {createOpen && <CreateMailboxModal domains={health.mailDomains} defaultLifetime={settings.defaultLifetime} onClose={() => setCreateOpen(false)} onCreate={createMailbox} />}
    {settingsOpen && <SettingsModal value={settings} onClose={() => setSettingsOpen(false)} onSave={savePreferences} />}
    {replyOpen && selectedMessage && active && <ReplyModal message={selectedMessage} from={active.address} onClose={() => setReplyOpen(false)} onSend={sendReply} />}
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
