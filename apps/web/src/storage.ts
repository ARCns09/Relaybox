export interface StoredCredential { address: string; token: string }

const VAULT_KEY = "relaybox.mailboxes.v1";
const SETTINGS_KEY = "relaybox.settings.v1";

export interface Settings {
  theme: "dark" | "light" | "system";
  defaultLifetime: number | null;
  autoCopy: boolean;
  autoDeleteExpired: boolean;
  blockRemoteImages: boolean;
  defaultHtml: boolean;
  autoMarkRead: boolean;
  browserNotifications: boolean;
  sound: boolean;
}

export const defaultSettings: Settings = {
  theme: "dark", defaultLifetime: 86400, autoCopy: true, autoDeleteExpired: true,
  blockRemoteImages: true, defaultHtml: true, autoMarkRead: true, browserNotifications: false, sound: false,
};

export function loadCredentials(): StoredCredential[] {
  try {
    const value = JSON.parse(localStorage.getItem(VAULT_KEY) ?? "[]") as unknown;
    return Array.isArray(value) ? value.filter((item): item is StoredCredential =>
      Boolean(item && typeof item === "object" && "address" in item && "token" in item)) : [];
  } catch { return []; }
}

export function saveCredentials(credentials: StoredCredential[]): void {
  localStorage.setItem(VAULT_KEY, JSON.stringify(credentials));
}

export function loadSettings(): Settings {
  try { return { ...defaultSettings, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}") as Partial<Settings> }; }
  catch { return defaultSettings; }
}

export function saveSettings(settings: Settings): void { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); }
