export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

export function relativeTime(value: string): string {
  const delta = Date.now() - new Date(value).getTime();
  if (delta < 60_000) return "now";
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h`;
  if (delta < 604_800_000) return `${Math.floor(delta / 86_400_000)}d`;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(value));
}

export function fullDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function lifetimeLabel(expiresAt: string | null, now = Date.now()): string {
  if (!expiresAt) return "Never expires";
  const seconds = Math.max(0, Math.floor((new Date(expiresAt).getTime() - now) / 1000));
  if (!seconds) return "Expired";
  const years = Math.floor(seconds / 31536000);
  const days = Math.floor((seconds % 31536000) / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  if (years) return `${years}y ${days}d ${hours}h ${minutes}m ${remainingSeconds}s remaining`;
  if (days) return `${days}d ${hours}h ${minutes}m ${remainingSeconds}s remaining`;
  if (hours) return `${hours}h ${minutes}m ${remainingSeconds}s remaining`;
  return `${minutes}m ${seconds % 60}s remaining`;
}

export function configuredLifetimeLabel(createdAt: string, expiresAt: string | null): string {
  if (!expiresAt) return "Never expires";
  const totalSeconds = Math.max(0, Math.round((new Date(expiresAt).getTime() - new Date(createdAt).getTime()) / 1000));
  const presets = new Map<number, string>([
    [600, "10 minutes"],
    [3600, "1 hour"],
    [86400, "24 hours"],
    [604800, "7 days"],
    [2592000, "30 days"],
  ]);
  const preset = presets.get(totalSeconds);
  if (preset) return preset;

  const years = Math.floor(totalSeconds / 31536000);
  const days = Math.floor((totalSeconds % 31536000) / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts: string[] = [];
  if (years) parts.push(`${years} ${years === 1 ? "year" : "years"}`);
  if (days) parts.push(`${days} ${days === 1 ? "day" : "days"}`);
  if (hours) parts.push(`${hours} ${hours === 1 ? "hour" : "hours"}`);
  if (minutes) parts.push(`${minutes} ${minutes === 1 ? "minute" : "minutes"}`);
  if (!parts.length || seconds) parts.push(`${seconds} ${seconds === 1 ? "second" : "seconds"}`);
  return parts.slice(0, 2).join(" ");
}

export function expiryProgress(createdAt: string, expiresAt: string | null, now = Date.now()): number {
  if (!expiresAt) return 100;
  const start = new Date(createdAt).getTime();
  const end = new Date(expiresAt).getTime();
  return Math.max(0, Math.min(100, ((end - now) / (end - start)) * 100));
}
