import { Bell, Check, Eye, HardDrive, KeyRound, LayoutDashboard, Moon, Palette, Save, Sun, Timer, UserRound, Volume2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { LIFETIME_OPTIONS } from "@relaybox/shared";
import type { Settings } from "../storage";
import type { PlatformUser } from "../platform";
import { formatBytes } from "../utils";
import { Modal } from "./Modal";
import { BeautifulSelect } from "./BeautifulSelect";

interface Props {
  value: Settings;
  user: PlatformUser;
  onClose(): void;
  onSave(value: Settings): void;
  onProfile(displayName: string): void;
  onChangePassword(input: { currentPassword: string; newPassword: string }): void;
  onOpenAdmin?: (() => void) | undefined;
}

export function SettingsModal({ value, user, onClose, onSave, onProfile, onChangePassword, onOpenAdmin }: Props) {
  const [settings, setSettings] = useState(value);
  const [displayName, setDisplayName] = useState(user.displayName ?? "");
  const [passwords, setPasswords] = useState({ current: "", next: "", confirm: "" });
  const [passwordError, setPasswordError] = useState("");
  const toggle = (key: keyof Settings) => setSettings((current) => ({ ...current, [key]: !current[key] }));
  const changePassword = () => {
    if (!passwords.current || passwords.next.length < 10) { setPasswordError("Enter your current password and a new password of at least 10 characters."); return; }
    if (passwords.next !== passwords.confirm) { setPasswordError("New password and confirmation do not match."); return; }
    setPasswordError(""); onChangePassword({ currentPassword: passwords.current, newPassword: passwords.next }); setPasswords({ current: "", next: "", confirm: "" });
  };
  return <Modal title="Settings" subtitle="Preferences stay in this browser." onClose={onClose} className="settings-modal">
    <div className="modal-content settings-content">
      <SettingsSection icon={<UserRound />} title="Profile">
        <div className="profile-settings"><label><span>Display name</span><input value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label><label><span>Account email</span><input value={user.email} disabled /></label><button className="secondary" onClick={() => onProfile(displayName.trim())}>Update profile</button></div>
      </SettingsSection>
      <SettingsSection icon={<HardDrive />} title="Account storage">
        <div className="account-storage-summary"><header><span><strong>{formatBytes(user.usedBytes)}</strong> used</span><span>{formatBytes(user.quotaBytes)} allocated</span></header><i><b style={{ width: `${Math.min(100, (user.usedBytes / user.quotaBytes) * 100)}%` }} /></i><small>{Math.round((user.usedBytes / user.quotaBytes) * 100)}% of your quota is in use across {user.mailboxCount} mailboxes.</small></div>
      </SettingsSection>
      <SettingsSection icon={<KeyRound />} title="Change password">
        <div className="password-settings"><input type="password" autoComplete="current-password" placeholder="Current password" value={passwords.current} onChange={(event) => setPasswords({ ...passwords, current: event.target.value })} /><input type="password" autoComplete="new-password" placeholder="New password" value={passwords.next} onChange={(event) => setPasswords({ ...passwords, next: event.target.value })} /><input type="password" autoComplete="new-password" placeholder="Confirm new password" value={passwords.confirm} onChange={(event) => setPasswords({ ...passwords, confirm: event.target.value })} /><button className="secondary" onClick={changePassword}>Change password</button>{passwordError && <p className="form-error">{passwordError}</p>}<small>Frontend preview only. This will connect to the account API later.</small></div>
      </SettingsSection>
      <SettingsSection icon={<Palette />} title="Appearance">
        <div className="theme-options">{(["dark", "light", "system"] as const).map((theme) => <button className={settings.theme === theme ? "active" : ""} key={theme} onClick={() => setSettings({ ...settings, theme })}>{theme === "dark" ? <Moon /> : theme === "light" ? <Sun /> : <Palette />}<span>{theme}</span>{settings.theme === theme && <Check />}</button>)}</div>
      </SettingsSection>
      <SettingsSection icon={<Timer />} title="Mailbox defaults">
        <div className="select-row"><span>Default lifetime<small>Used for new mailboxes</small></span><BeautifulSelect value={String(settings.defaultLifetime)} options={LIFETIME_OPTIONS.map((option) => ({ value: String(option.value), label: option.label }))} onChange={(value) => setSettings({ ...settings, defaultLifetime: value === "null" ? null : Number(value) })} ariaLabel="Default mailbox lifetime" minMenuWidth={175} /></div>
        <Switch checked={settings.autoCopy} label="Copy new address automatically" onClick={() => toggle("autoCopy")} />
        <Switch checked={settings.autoDeleteExpired} label="Forget expired mailboxes automatically" onClick={() => toggle("autoDeleteExpired")} />
      </SettingsSection>
      <SettingsSection icon={<Eye />} title="Email viewing">
        <Switch checked={settings.blockRemoteImages} label="Block remote images by default" onClick={() => toggle("blockRemoteImages")} />
        <Switch checked={settings.defaultHtml} label="Open HTML view by default" onClick={() => toggle("defaultHtml")} />
        <Switch checked={settings.autoMarkRead} label="Mark messages read when opened" onClick={() => toggle("autoMarkRead")} />
      </SettingsSection>
      <SettingsSection icon={<Bell />} title="Notifications">
        <Switch checked={settings.browserNotifications} label="Browser notifications" onClick={() => toggle("browserNotifications")} icon={<Bell />} />
        <Switch checked={settings.sound} label="New message sound" onClick={() => toggle("sound")} icon={<Volume2 />} />
      </SettingsSection>
      {user.role === "admin" && <SettingsSection icon={<LayoutDashboard />} title="Administration"><div className="admin-settings-link"><p><strong>Server, users, storage, and domains</strong><span>Open the private administrator workspace.</span></p><button className="secondary" onClick={onOpenAdmin}><LayoutDashboard /> Open admin</button></div>{user.primaryMailbox && <div className="admin-mailbox-info"><Check /><p><strong>Primary protected mailbox</strong><span>{user.primaryMailbox} · permanent · deletion protected</span></p></div>}</SettingsSection>}
    </div>
    <footer className="modal-actions"><button className="text-button" onClick={onClose}>Cancel</button><button className="primary" onClick={() => onSave(settings)}><Save /> Save preferences</button></footer>
  </Modal>;
}

function SettingsSection({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return <section className="settings-section"><h3>{icon}{title}</h3>{children}</section>;
}

function Switch({ checked, label, onClick, icon }: { checked: boolean; label: string; onClick(): void; icon?: ReactNode }) {
  return <button className="switch-row" onClick={onClick}>{icon}<span>{label}</span><i className={checked ? "on" : ""}><b /></i></button>;
}
