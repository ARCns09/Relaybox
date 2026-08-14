import type { RealtimeEvent } from "@relaybox/shared";

type Listener = (event: RealtimeEvent) => void;

export class RealtimeHub {
  private listeners = new Map<string, Set<Listener>>();

  subscribe(mailboxId: string, listener: Listener): () => void {
    const set = this.listeners.get(mailboxId) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(mailboxId, set);
    return () => {
      set.delete(listener);
      if (!set.size) this.listeners.delete(mailboxId);
    };
  }

  publish(mailboxId: string, event: RealtimeEvent): void {
    this.listeners.get(mailboxId)?.forEach((listener) => listener(event));
  }
}
