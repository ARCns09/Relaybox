export type UserRole = "admin" | "member";
export type AccountStatus = "active" | "disabled";
export type MailboxType = "admin" | "temporary";
export type DomainStatus = "active" | "upcoming" | "disabled";

export interface PlatformUser {
  id: string;
  email: string;
  displayName?: string;
  role: UserRole;
  status: AccountStatus;
  quotaBytes: number;
  usedBytes: number;
  mailboxCount: number;
  createdAt: string;
  lastLoginAt?: string;
  primaryMailbox?: string;
  mailboxType: MailboxType;
  isProtected: boolean;
}

export interface DomainCapability {
  domain: string;
  visibility: "public" | "reserved";
  allowMailboxCreation: boolean;
  status: DomainStatus;
  reservedMailboxes: string[];
}

export interface PlatformStorage {
  totalStorageBytes: number;
  systemReservedBytes: number;
  relayboxCapacityBytes: number;
}

export interface PlatformMetrics {
  messagesStored: number;
  attachmentBytes: number;
  permanentMailboxes: number;
  temporaryMailboxes: number;
}

export interface PlatformState {
  users: PlatformUser[];
  domains: DomainCapability[];
  storage: PlatformStorage;
  metrics: PlatformMetrics;
}

export interface StorageStats extends PlatformStorage {
  allocatedBytes: number;
  unallocatedBytes: number;
  actualUsedBytes: number;
  usagePercent: number;
  userCount: number;
  mailboxCount: number;
}

export interface OneTimeCredentials {
  email: string;
  temporaryPassword: string;
  quotaBytes: number;
}

const GIB = 1024 ** 3;
const PLATFORM_KEY = "relaybox.platform-preview.v1";
const SESSION_KEY = "relaybox.session-preview.v1";

export const initialPlatformState: PlatformState = {
  storage: {
    totalStorageBytes: 160 * GIB,
    systemReservedBytes: 40 * GIB,
    relayboxCapacityBytes: 120 * GIB,
  },
  metrics: {
    messagesStored: 1842,
    attachmentBytes: 6.7 * GIB,
    permanentMailboxes: 6,
    temporaryMailboxes: 18,
  },
  domains: [
    { domain: "relaybox.ryzn.pro", visibility: "public", allowMailboxCreation: true, status: "active", reservedMailboxes: [] },
    { domain: "mail.arcn.online", visibility: "public", allowMailboxCreation: false, status: "upcoming", reservedMailboxes: [] },
    { domain: "arcn.online", visibility: "reserved", allowMailboxCreation: false, status: "active", reservedMailboxes: ["arc@arcn.online"] },
  ],
  users: [
    {
      id: "user-admin", email: "arc@arcn.online", displayName: "Arc", role: "admin", status: "active",
      quotaBytes: 5 * GIB, usedBytes: 2.4 * GIB, mailboxCount: 4, createdAt: "2026-01-11T10:00:00Z",
      lastLoginAt: "2026-08-20T06:20:00Z", primaryMailbox: "arc@arcn.online", mailboxType: "admin", isProtected: true,
    },
    {
      id: "user-mira", email: "mira@example.com", displayName: "Mira Chen", role: "member", status: "active",
      quotaBytes: 8 * GIB, usedBytes: 5.6 * GIB, mailboxCount: 7, createdAt: "2026-04-02T12:00:00Z",
      lastLoginAt: "2026-08-19T17:42:00Z", mailboxType: "temporary", isProtected: false,
    },
    {
      id: "user-noah", email: "noah@example.com", displayName: "Noah", role: "member", status: "active",
      quotaBytes: 3 * GIB, usedBytes: 780 * 1024 ** 2, mailboxCount: 5, createdAt: "2026-05-18T09:30:00Z",
      lastLoginAt: "2026-08-17T11:04:00Z", mailboxType: "temporary", isProtected: false,
    },
    {
      id: "user-ivy", email: "ivy@example.com", displayName: "Ivy", role: "member", status: "disabled",
      quotaBytes: 2 * GIB, usedBytes: 340 * 1024 ** 2, mailboxCount: 2, createdAt: "2026-06-29T15:20:00Z",
      lastLoginAt: "2026-07-12T08:17:00Z", mailboxType: "temporary", isProtected: false,
    },
  ],
};

export function platformStorageStats(state: PlatformState): StorageStats {
  const allocatedBytes = state.users.reduce((total, user) => total + user.quotaBytes, 0);
  const actualUsedBytes = state.users.reduce((total, user) => total + user.usedBytes, 0);
  return {
    ...state.storage,
    allocatedBytes,
    unallocatedBytes: Math.max(0, state.storage.relayboxCapacityBytes - allocatedBytes),
    actualUsedBytes,
    usagePercent: state.storage.relayboxCapacityBytes ? (actualUsedBytes / state.storage.relayboxCapacityBytes) * 100 : 0,
    userCount: state.users.length,
    mailboxCount: state.users.reduce((total, user) => total + user.mailboxCount, 0),
  };
}

export function publicDomains(state: PlatformState): string[] {
  return state.domains.filter((domain) => domain.visibility === "public" && domain.status === "active" && domain.allowMailboxCreation).map((domain) => domain.domain);
}

export function loadPlatformState(): PlatformState {
  try {
    const stored = JSON.parse(localStorage.getItem(PLATFORM_KEY) ?? "null") as PlatformState | null;
    if (!stored?.users || !stored.domains || !stored.storage) return structuredClone(initialPlatformState);
    return {
      ...stored,
      domains: stored.domains.map((domain) => ({
        ...domain,
        status: (domain.status as string) === "planned" ? "upcoming" : domain.status,
        allowMailboxCreation: (domain.status as string) === "planned" ? false : domain.allowMailboxCreation,
      })),
    };
  } catch { return structuredClone(initialPlatformState); }
}

export function savePlatformState(state: PlatformState): void {
  localStorage.setItem(PLATFORM_KEY, JSON.stringify(state));
}

export function loadPreviewSession(): string | undefined {
  return localStorage.getItem(SESSION_KEY) ?? undefined;
}

export function savePreviewSession(userId: string | undefined): void {
  if (userId) localStorage.setItem(SESSION_KEY, userId);
  else localStorage.removeItem(SESSION_KEY);
}

export function generateTemporaryPassword(length = 20): string {
  const groups = ["ABCDEFGHJKLMNPQRSTUVWXYZ", "abcdefghijkmnopqrstuvwxyz", "23456789", "!@#$%"];
  const alphabet = groups.join("");
  const size = Math.max(groups.length, length);
  const values = crypto.getRandomValues(new Uint32Array(size * 2));
  const characters = groups.map((group, index) => group[values[index]! % group.length]);
  for (let index = groups.length; index < size; index += 1) characters.push(alphabet[values[index]! % alphabet.length]);
  for (let index = characters.length - 1; index > 0; index -= 1) {
    const swapIndex = values[size + index]! % (index + 1);
    [characters[index], characters[swapIndex]] = [characters[swapIndex]!, characters[index]!];
  }
  return characters.join("");
}
