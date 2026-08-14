import { AlertCircle, CheckCircle2, X } from "lucide-react";

export function Toast({ message, tone = "success", onClose }: { message: string; tone?: "success" | "error"; onClose(): void }) {
  return <div className={`toast ${tone}`}>{tone === "success" ? <CheckCircle2 /> : <AlertCircle />}<span>{message}</span><button onClick={onClose}><X /></button></div>;
}
