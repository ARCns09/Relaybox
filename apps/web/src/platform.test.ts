import { beforeEach, describe, expect, it } from "vitest";
import { generateTemporaryPassword, initialPlatformState, loadPlatformState, platformStorageStats, publicDomains, savePlatformState } from "./platform";

describe("platform preview model", () => {
  beforeEach(() => localStorage.clear());

  it("accounts for allocated, used, and unallocated storage from supplied capacity", () => {
    const stats = platformStorageStats(initialPlatformState);
    expect(stats.allocatedBytes).toBe(initialPlatformState.users.reduce((sum, user) => sum + user.quotaBytes, 0));
    expect(stats.actualUsedBytes).toBe(initialPlatformState.users.reduce((sum, user) => sum + user.usedBytes, 0));
    expect(stats.unallocatedBytes).toBe(initialPlatformState.storage.relayboxCapacityBytes - stats.allocatedBytes);
    expect(stats.mailboxCount).toBe(18);
  });

  it("only exposes explicitly public mailbox domains", () => {
    expect(publicDomains(initialPlatformState)).toContain("relaybox.ryzn.pro");
    expect(publicDomains(initialPlatformState)).not.toContain("mail.arcn.online");
    expect(publicDomains(initialPlatformState)).not.toContain("arcn.online");
    expect(initialPlatformState.users[0]).toMatchObject({ role: "admin", mailboxType: "admin", isProtected: true });
  });

  it("persists mock platform state and generates strong temporary credentials", () => {
    savePlatformState(initialPlatformState);
    expect(loadPlatformState().users).toHaveLength(initialPlatformState.users.length);
    const password = generateTemporaryPassword();
    expect(password).toHaveLength(20);
    expect(password).toMatch(/[A-Z]/);
    expect(password).toMatch(/[a-z]/);
    expect(password).toMatch(/[2-9]/);
    expect(password).toMatch(/[!@#$%]/);
  });
});
