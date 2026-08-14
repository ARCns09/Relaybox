import { beforeEach, describe, expect, it } from "vitest";
import { configuredLifetimeLabel, expiryProgress, formatBytes, lifetimeLabel } from "./utils";
import { defaultSettings, loadCredentials, loadSettings, saveCredentials, saveSettings } from "./storage";

describe("display utilities", () => {
  it("formats storage and remaining lifetime", () => {
    expect(formatBytes(3.4 * 1024 * 1024)).toBe("3.4 MB");
    const now = new Date("2026-01-01T00:00:00Z").getTime();
    expect(lifetimeLabel("2026-01-01T01:30:00Z", now)).toBe("1h 30m 0s remaining");
    expect(expiryProgress("2026-01-01T00:00:00Z", "2026-01-01T02:00:00Z", now + 3_600_000)).toBe(50);
  });

  it("shows configured preset, custom, and permanent lifetimes", () => {
    const created = "2026-01-01T00:00:00Z";
    expect(configuredLifetimeLabel(created, "2026-01-01T00:10:00Z")).toBe("10 minutes");
    expect(configuredLifetimeLabel(created, "2026-01-01T01:00:00Z")).toBe("1 hour");
    expect(configuredLifetimeLabel(created, "2026-01-02T00:00:00Z")).toBe("24 hours");
    expect(configuredLifetimeLabel(created, "2026-01-08T00:00:00Z")).toBe("7 days");
    expect(configuredLifetimeLabel(created, "2026-01-31T00:00:00Z")).toBe("30 days");
    expect(configuredLifetimeLabel(created, "2026-01-01T01:30:00Z")).toBe("1 hour 30 minutes");
    expect(configuredLifetimeLabel(created, null)).toBe("Never expires");
    expect(lifetimeLabel(null)).toBe("Never expires");
    expect(configuredLifetimeLabel(created, "2028-01-01T00:00:00Z")).toBe("2 years");
  });
});

describe("browser vault", () => {
  beforeEach(() => localStorage.clear());

  it("persists credentials and preferences locally", () => {
    saveCredentials([{ address: "fox@mail.test", token: "secret" }]);
    expect(loadCredentials()).toEqual([{ address: "fox@mail.test", token: "secret" }]);
    const settings = { ...defaultSettings, theme: "light" as const, sound: true };
    saveSettings(settings);
    expect(loadSettings()).toEqual(settings);
  });
});
