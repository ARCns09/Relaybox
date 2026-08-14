import type { DatabaseSync } from "node:sqlite";
import type { SenderLogo } from "@relaybox/shared";

const knownBrands: Record<string, string> = {
  "github.com": "github",
  "discord.com": "discord",
  "google.com": "google",
  "notion.so": "notion",
  "stripe.com": "stripe",
  "slack.com": "slack",
  "figma.com": "figma",
};

const palette = ["#7657ff", "#00a986", "#e7783f", "#2788d7", "#d84d8c", "#9a7b15"];

function colorFor(domain: string): string {
  let hash = 0;
  for (const character of domain) hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
  return palette[Math.abs(hash) % palette.length]!;
}

export class SenderLogoResolver {
  constructor(private readonly db: DatabaseSync) {}

  resolve(email: string): SenderLogo {
    const domain = email.split("@").at(-1)?.toLowerCase() ?? "unknown";
    const cached = this.db.prepare("SELECT logo_url, source FROM sender_logos WHERE domain = ?").get(domain) as
      | { logo_url: string; source: string }
      | undefined;
    if (cached) {
      return cached.source === "bimi" || cached.source === "favicon"
        ? { kind: "favicon", value: cached.logo_url }
        : { kind: "brand", value: cached.logo_url };
    }
    const brand = knownBrands[domain];
    if (brand) {
      this.db.prepare("INSERT OR REPLACE INTO sender_logos (domain, logo_url, source, cached_at) VALUES (?, ?, 'known', ?)")
        .run(domain, brand, new Date().toISOString());
      return { kind: "brand", value: brand };
    }
    const root = domain.split(".")[0] || "?";
    return { kind: "generated", value: root.slice(0, 2).toUpperCase(), background: colorFor(domain) };
  }
}
