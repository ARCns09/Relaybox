import { describe, expect, it } from "vitest";
import { createAccessToken, generateAlias, hashToken, sanitizeFilename, tokenMatches, validateAlias } from "./security.js";
import { sanitizeEmailHtml } from "./sanitizer.js";

describe("mailbox security", () => {
  it("accepts safe aliases and rejects reserved or unsafe aliases", () => {
    expect(validateAlias("pixel-fox_82")).toEqual([]);
    expect(validateAlias("admin")).toContain("That alias is reserved.");
    expect(validateAlias("../root").length).toBeGreaterThan(0);
    expect(validateAlias("space alias").length).toBeGreaterThan(0);
  });

  it("generates valid aliases", () => {
    expect(validateAlias(generateAlias())).toEqual([]);
  });

  it("compares access tokens without storing plaintext", () => {
    const token = createAccessToken();
    const hash = hashToken(token);
    expect(hash).not.toContain(token);
    expect(tokenMatches(token, hash)).toBe(true);
    expect(tokenMatches(createAccessToken(), hash)).toBe(false);
  });

  it("sanitizes attachment filenames", () => {
    expect(sanitizeFilename("../../secret\n.exe")).toBe(".._.._secret_.exe");
  });
});

describe("email HTML sanitizer", () => {
  it("removes active content and parks remote images", () => {
    const result = sanitizeEmailHtml(`<script>alert(1)</script><iframe src="https://evil.test"></iframe><img src="https://tracker.test/pixel"><a href="javascript:alert(2)">bad</a>`);
    expect(result).not.toContain("script");
    expect(result).not.toContain("iframe");
    expect(result).not.toContain("javascript:");
    expect(result).toContain("data-remote-src=\"https://tracker.test/pixel\"");
  });
});
