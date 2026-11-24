import "@tanstack/react-start/server-only";
import { and, eq, inArray } from "drizzle-orm";

import { emitAppEvent } from "#/server/events";

import {
  ACTIVE_REQUEST_STATUSES,
  canTransition,
  type MediaType,
  type RequestStatus,
} from "#/lib/requests";
import type { AppDatabase } from "#/server/db/client";
import { request, requestEvent, requestWatcher, type RequestTarget } from "#/server/db/schema";

/** A user id, or `"system"` (jobs, auto-approval) / `"webhook"` (backend callbacks). */
export type Actor = string;

export class RequestNotFoundError extends Error {
  constructor(readonly requestId: string) {
    super(`Request ${requestId} not found`);
    this.name = "RequestNotFoundError";
  }
}

export class InvalidTransitionError extends Error {
  constructor(
    readonly from: RequestStatus,
    readonly to: RequestStatus,
  ) {
    super(`Request can't go from ${from} to ${to}`);
    this.name = "InvalidTransitionError";
  }
}

export function targetKey(target: RequestTarget): string {
  return `chaptarr:${target.rootFolderPath}`;
}

export type CreateRequestInput = {
  mediaId: string;
  userId: string;
  format: MediaType;
  target: RequestTarget;
  qualityProfileId?: number | null;
  /** Admins and auto-approved users skip `pending`. */
  autoApprove: boolean;
};

export type CreateRequestResult =
  | { kind: "created"; requestId: string; status: RequestStatus }
  /** An active request already holds this slot: the user now watches it. */
  | { kind: "attached"; requestId: string; status: RequestStatus };

/** Creates a request, or attaches the user to the active one for the same media, format and target. */
export function createRequest(db: AppDatabase, input: CreateRequestInput): CreateRequestResult {
  const result = insertRequest(db, input);
  // One event per new request: pending, or approved straight away (auto-approval).
  if (result.kind === "created") {
    emitAppEvent({
      kind: "request",
      requestId: result.requestId,
      from: null,
      to: result.status,
      actor: input.userId,
      message: null,
    });
  }
  return result;
}

function insertRequest(db: AppDatabase, input: CreateRequestInput): CreateRequestResult {
  const key = targetKey(input.target);
  return db.transaction((tx) => {
    const existing = tx
      .select({ id: request.id, status: request.status, userId: request.userId })
      .from(request)
      .where(
        and(
          eq(request.mediaId, input.mediaId),
          eq(request.format, input.format),
          eq(request.targetKey, key),
          inArray(request.status, ACTIVE_REQUEST_STATUSES),
        ),
      )
      .get();
    if (existing) {
      if (existing.userId !== input.userId) {
        tx.insert(requestWatcher)
          .values({ requestId: existing.id, userId: input.userId })
          .onConflictDoNothing()
          .run();
      }
      return { kind: "attached", requestId: existing.id, status: existing.status };
    }

    const created = tx
      .insert(request)
      .values({
        mediaId: input.mediaId,
        userId: input.userId,
        format: input.format,
        target: input.target,
        targetKey: key,
        qualityProfileId: input.qualityProfileId ?? null,
      })
      .returning({ id: request.id })
      .get();
    tx.insert(requestEvent)
      .values({ requestId: created.id, actor: input.userId, fromStatus: null, toStatus: "pending" })
      .run();

    if (!input.autoApprove) return { kind: "created", requestId: created.id, status: "pending" };
    applyTransition(tx, created.id, "pending", { to: "approved", actor: "system" });
    return { kind: "created", requestId: created.id, status: "approved" };
  });
}

export type TransitionInput = {
  to: RequestStatus;
  actor: Actor;
  /** Shown in the request history (upstream error, deny reason…). */
  message?: string | null;
  backendRef?: Record<string, string | number>;
};

/** Moves a request to a new status if allowed, recording who did it and why. */
export function transitionRequest(
  db: AppDatabase,
  requestId: string,
  input: TransitionInput,
): RequestStatus {
  const from = db.transaction((tx) => {
    const current = tx
      .select({ status: request.status })
      .from(request)
      .where(eq(request.id, requestId))
      .get();
    if (!current) throw new RequestNotFoundError(requestId);
    applyTransition(tx, requestId, current.status, input);
    return current.status;
  });
  emitAppEvent({
    kind: "request",
    requestId,
    from,
    to: input.to,
    actor: input.actor,
    message: input.message ?? null,
  });
  return input.to;
}

type Tx = Parameters<Parameters<AppDatabase["transaction"]>[0]>[0];

function applyTransition(tx: Tx, requestId: string, from: RequestStatus, input: TransitionInput) {
  if (!canTransition(from, input.to)) throw new InvalidTransitionError(from, input.to);
  tx.update(request)
    .set({
      status: input.to,
      lastError: input.to === "failed" ? (input.message ?? null) : null,
      ...(input.backendRef ? { backendRef: input.backendRef } : {}),
      updatedAt: new Date(),
    })
    .where(eq(request.id, requestId))
    .run();
  tx.insert(requestEvent)
    .values({
      requestId,
      actor: input.actor,
      fromStatus: from,
      toStatus: input.to,
      message: input.message ?? null,
    })
    .run();
}
