import { Github, MessageCircle, CreditCard, Shapes } from "lucide-react";
import type { SenderLogo } from "@relaybox/shared";

export function Brand({ compact = false }: { compact?: boolean }) {
  return <div className="brand" aria-label="Relaybox">
    <span className="brand-mark"><i /><i /><i /></span>
    {!compact && <span><strong>relay</strong>box</span>}
  </div>;
}

export function SenderAvatar({ logo, name, size = "medium" }: { logo: SenderLogo; name: string; size?: "small" | "medium" | "large" }) {
  if (logo.kind === "favicon") return <span className={`sender-avatar ${size}`}><img src={logo.value} alt="" referrerPolicy="no-referrer" /></span>;
  if (logo.kind === "brand") {
    const Icon = logo.value === "github" ? Github : logo.value === "discord" ? MessageCircle : logo.value === "stripe" ? CreditCard : Shapes;
    return <span className={`sender-avatar ${size} brand-${logo.value}`}><Icon aria-label={`${name} logo`} /></span>;
  }
  return <span className={`sender-avatar ${size}`} style={{ background: logo.background }}>{logo.value}</span>;
}
