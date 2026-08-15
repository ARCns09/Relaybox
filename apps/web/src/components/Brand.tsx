import { Github, MessageCircle, CreditCard, Shapes } from "lucide-react";
import { useEffect, useState } from "react";
import type { SenderLogo } from "@relaybox/shared";

export function Brand({ compact = false }: { compact?: boolean }) {
  return <div className="brand" aria-label="Relaybox">
    <span className="brand-mark"><i /><i /><i /></span>
    {!compact && <span><strong>relay</strong>box</span>}
  </div>;
}

export function SenderAvatar({ logo, name, size = "medium" }: { logo: SenderLogo; name: string; size?: "small" | "medium" | "large" }) {
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => setImageFailed(false), [logo.kind, logo.value]);
  if (logo.kind === "favicon" && !imageFailed) return <span className={`sender-avatar ${size}`}><img src={logo.value} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setImageFailed(true)} /></span>;
  if (logo.kind === "brand") {
    const Icon = logo.value === "github" ? Github : logo.value === "discord" ? MessageCircle : logo.value === "stripe" ? CreditCard : Shapes;
    return <span className={`sender-avatar ${size} brand-${logo.value}`}><Icon aria-label={`${name} logo`} /></span>;
  }
  const initials = name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "?";
  return <span className={`sender-avatar ${size}`} style={{ background: logo.background ?? avatarColor(name) }}>{initials}</span>;
}

function avatarColor(value: string): string {
  const colors = ["#7657ff", "#168f79", "#c46738", "#357fc3", "#bd4c82", "#8b741d"];
  let hash = 0;
  for (const character of value) hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
  return colors[Math.abs(hash) % colors.length]!;
}
