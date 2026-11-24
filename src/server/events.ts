import "@tanstack/react-start/server-only";

import type { RequestStatus } from "#/lib/requests";

/** What changed, announced after the database write commits (notifications listen). */
export type AppEvent =
  | {
      kind: "request";
      requestId: string;
      from: RequestStatus | null;
      to: RequestStatus;
      actor: string;
      message: string | null;
    }
  | { kind: "issue_created"; issueId: string; userId: string }
  | { kind: "issue_comment"; issueId: string; userId: string; message: string }
  | { kind: "issue_status"; issueId: string; status: "open" | "resolved" };

type Listener = (event: AppEvent) => void;

declare global {
  // One list per process, kept across dev HMR re-evaluations.
  var storyrrEventListeners: Set<Listener> | undefined;
}

const listeners = (globalThis.storyrrEventListeners ??= new Set<Listener>());

/** Subscribes to app events; returns the unsubscribe function. */
export function onAppEvent(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Announces an event. A failing listener never breaks the write that emitted it. */
export function emitAppEvent(event: AppEvent): void {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch (error) {
      console.error("[events] listener failed:", error);
    }
  }
}
