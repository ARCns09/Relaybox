import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const RESERVED_ALIASES = new Set([
  "admin", "root", "system", "support", "postmaster", "abuse", "webmaster",
]);

const aliasPattern = /^[a-z0-9](?:[a-z0-9._-]{0,61}[a-z0-9])?$/;

export function normalizeAlias(input: string): string {
  return input.trim().toLowerCase();
}

export function validateAlias(input: string): string[] {
  const alias = normalizeAlias(input);
  const errors: string[] = [];
  if (alias.length < 2) errors.push("Alias must be at least 2 characters.");
  if (alias.length > 63) errors.push("Alias must be at most 63 characters.");
  if (!aliasPattern.test(alias)) errors.push("Use letters, numbers, dots, hyphens, or underscores; start and end with a letter or number.");
  if (RESERVED_ALIASES.has(alias)) errors.push("That alias is reserved.");
  return errors;
}

const adjectives = ["amber", "brisk", "calm", "cobalt", "fuzzy", "lunar", "mint", "quiet", "swift", "violet"];
const nouns = ["badger", "comet", "finch", "fox", "koala", "moth", "otter", "panda", "raven", "tiger"];

export function generateAlias(): string {
  const bytes = randomBytes(3);
  return `${adjectives[bytes[0]! % adjectives.length]}-${nouns[bytes[1]! % nouns.length]}-${100 + (bytes[2]! % 900)}`;
}

export function createAccessToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function tokenMatches(token: string, storedHash: string): boolean {
  const candidate = Buffer.from(hashToken(token));
  const expected = Buffer.from(storedHash);
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

export function sanitizeFilename(filename: string): string {
  const cleaned = filename.normalize("NFKC").replace(/[/\\\0\r\n]/g, "_").replace(/[^\w.() -]/g, "_").trim();
  return (cleaned || "attachment").slice(0, 160);
}
