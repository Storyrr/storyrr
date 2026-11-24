import "@tanstack/react-start/server-only";
import { format } from "node:util";

/** Severity of a captured log line (from the console method used). */
export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogEntry = { id: number; time: number; level: LogLevel; message: string };

const MAX_ENTRIES = 1000;

declare global {
  // Kept across dev HMR: one buffer per process.
  var storyrrLogs: { entries: LogEntry[]; nextId: number; installed: boolean } | undefined;
}

const store = (globalThis.storyrrLogs ??= { entries: [], nextId: 1, installed: false });

/** Remembers a log line (the newest MAX_ENTRIES are kept). */
export function recordLog(level: LogLevel, message: string, time = Date.now()): void {
  store.entries.push({ id: store.nextId++, time, level, message });
  if (store.entries.length > MAX_ENTRIES)
    store.entries.splice(0, store.entries.length - MAX_ENTRIES);
}

/** Sends a console method's output to the buffer as well. */
function wrap(method: "debug" | "log" | "info" | "warn" | "error", level: LogLevel) {
  const original = console[method].bind(console);
  console[method] = (...args: unknown[]) => {
    original(...args);
    try {
      recordLog(level, format(...args));
    } catch {
      // Never let logging break the caller.
    }
  };
}

/**
 * Mirrors the server's console output into the in-memory buffer shown in
 * Settings → Jobs & logs. Output still goes to stdout (Docker logs). Storyrr
 * never logs secrets (tokens and keys are redacted at the source).
 */
export function installLogCapture(): void {
  if (store.installed) return;
  store.installed = true;
  wrap("debug", "debug");
  wrap("log", "info");
  wrap("info", "info");
  wrap("warn", "warn");
  wrap("error", "error");
}

/** Captured lines, newest first, optionally of a minimum level and containing a text. */
export function readLogs({
  minLevel = "debug",
  search = "",
  limit = 500,
}: { minLevel?: LogLevel; search?: string; limit?: number } = {}): LogEntry[] {
  const rank: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
  const needle = search.toLocaleLowerCase();
  return store.entries
    .filter((e) => rank[e.level] >= rank[minLevel])
    .filter((e) => !needle || e.message.toLocaleLowerCase().includes(needle))
    .toReversed()
    .slice(0, limit);
}
