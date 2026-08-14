import { Bell, Check, Eye, Moon, Palette, Save, Sun, Timer, Volume2 } from "lucide-react";
import { useState } from "react";
import { LIFETIME_OPTIONS } from "@relaybox/shared";
import type { Settings } from "../storage";
import { Modal } from "./Modal";
import { BeautifulSelect } from "./BeautifulSelect";

export function SettingsModal({ value, onClose, onSave }: { value: Settings; onClose(): void; onSave(value: Settings): void }) {
  const [settings, setSettings] = useState(value);
  const toggle = (key: keyof Settings) => setSettings((current) => ({ ...current, [key]: !current[key] }));
  return <Modal title="Settings" subtitle="Preferences stay in this browser." onClose={onClose} className="settings-modal">
    <div className="modal-content settings-content">
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
    </div>
    <footer className="modal-actions"><button className="text-button" onClick={onClose}>Cancel</button><button className="primary" onClick={() => onSave(settings)}><Save /> Save preferences</button></footer>
  </Modal>;
}

function SettingsSection({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return <section className="settings-section"><h3>{icon}{title}</h3>{children}</section>;
}

function Switch({ checked, label, onClick, icon }: { checked: boolean; label: string; onClick(): void; icon?: React.ReactNode }) {
  return <button className="switch-row" onClick={onClick}>{icon}<span>{label}</span><i className={checked ? "on" : ""}><b /></i></button>;
}
