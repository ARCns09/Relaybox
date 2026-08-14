import { useEffect } from "react";
import type { RealtimeEvent } from "@relaybox/shared";
import { api } from "./api";

export function useRealtime(address: string | undefined, token: string | undefined, onEvent: (event: RealtimeEvent) => void): void {
  useEffect(() => {
    if (!address || !token) return;
    const controller = new AbortController();
    let retry: number | undefined;
    const connect = async () => {
      try {
        const response = await fetch(api.eventsUrl(address), { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal });
        if (!response.ok || !response.body) return;
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const blocks = buffer.split("\n\n");
          buffer = blocks.pop() ?? "";
          for (const block of blocks) {
            const data = block.split("\n").find((line) => line.startsWith("data: "))?.slice(6);
            if (data) onEvent(JSON.parse(data) as RealtimeEvent);
          }
        }
      } catch (error) {
        if (!controller.signal.aborted) retry = window.setTimeout(connect, 2500);
      }
    };
    void connect();
    return () => { controller.abort(); if (retry) clearTimeout(retry); };
  }, [address, token, onEvent]);
}
