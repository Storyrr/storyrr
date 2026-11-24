import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { APIError } from "better-auth/api";
import { eq, sql } from "drizzle-orm";

import { CHAPTARR_FORMATS } from "#/lib/schemas/settings";
import { ChangePasswordSchema, ProfileSchema } from "#/lib/schemas/profile";
import { m } from "#/paraglide/messages.js";
import { auth } from "#/server/auth";
import { requireUser } from "#/server/auth/middleware";
import { db } from "#/server/db";
import { request } from "#/server/db/schema";
import { setUserLocale } from "#/server/profile";
import { isAutoApproved } from "#/server/requests/queries";
import { requestQuota } from "#/server/requests/quota";
import { settings } from "#/server/settings";

/** The caller's account: membership, request counts, permissions and limits. */
export const getMyAccount = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .handler(async ({ context }) => {
    const { user } = context.session;
    const isAdmin = user.role === "admin";
    const counts = db
      .select({ total: sql`count(*)`.mapWith(Number) })
      .from(request)
      .where(eq(request.userId, user.id))
      .get();
    const quotas = await Promise.all(
      CHAPTARR_FORMATS.map((format) =>
        requestQuota({ db, settings }, { id: user.id, isAdmin }, format),
      ),
    );
    return {
      createdAt: user.createdAt,
      isAdmin,
      autoApproved: isAutoApproved(db, user.id, isAdmin),
      requests: { total: counts?.total ?? 0 },
      quotas: { audiobook: quotas[0], ebook: quotas[1] },
    };
  });

/** Display name and language. The email stays as the admin created it. */
export const updateProfile = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(ProfileSchema)
  .handler(async ({ data, context }) => {
    if (data.name !== context.session.user.name)
      await auth.api.updateUser({ body: { name: data.name }, headers: getRequestHeaders() });
    setUserLocale(db, context.session.user.id, data.locale === "default" ? null : data.locale);
    return { ok: true };
  });

/** Changes the caller's password and signs out their other sessions. */
export const changePassword = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(ChangePasswordSchema)
  .handler(async ({ data }) => {
    try {
      await auth.api.changePassword({
        body: { ...data, revokeOtherSessions: true },
        headers: getRequestHeaders(),
      });
    } catch (error) {
      if (error instanceof APIError && error.body?.code === "INVALID_PASSWORD") {
        return {
          ok: false as const,
          field: "currentPassword" as const,
          message: m.password_wrong(),
        };
      }
      throw error;
    }
    return { ok: true as const };
  });
