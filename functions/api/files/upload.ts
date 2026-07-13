import type { Env } from "../../_lib/env";
import { requireDb } from "../../_lib/db";
import { canWriteFiles, permissionDeniedJson, resolveActorAccess } from "../../_lib/permissions";
import { HttpError, okJson, routeError } from "../../_lib/http";
import { checkInMemoryRateLimit, rateLimitClientId } from "../../_lib/rate-limit";
import {
  assertUploadFileAllowed,
  normalizeUploadMimeType,
} from "../../../src/lib/chemvault-files/validation";
import { resolveBillingEntitlements, storageQuotaBytesForPlan } from "../../_lib/billing-entitlements";
import { storageUsage } from "../../_lib/drive-service";

export { onRequestPost } from "./init";

export const onRequestPut: PagesFunction<Env> = async ({ request, env }) => {
  try {
    if (!env.FILES_BUCKET) throw new Error("R2 binding FILES_BUCKET is not configured");
    const db = requireDb(env.FILES_DB);
    const access = await resolveActorAccess(request, env, db);
    if (!canWriteFiles(access)) return permissionDeniedJson(access, "write");
    const limited = checkInMemoryRateLimit({
      key: `files:upload:${rateLimitClientId(request, access.actorEmail)}`,
      limit: 10,
      windowMs: 60 * 1000,
    });
    if (limited) return limited;
    const url = new URL(request.url);
    const fileId = url.searchParams.get("fileId") || "";
    const sessionId = url.searchParams.get("sessionId") || "";
    if (!fileId || !sessionId) throw new Error("fileId and sessionId are required");
    if (!request.body) throw new Error("Upload body is required");

    const row = await db
      .prepare("SELECT r2_key, original_name, mime_type, size_bytes FROM files WHERE id = ? AND upload_session_id = ? AND deleted_at IS NULL")
      .bind(fileId, sessionId)
      .first<{ r2_key: string; original_name: string; mime_type: string | null; size_bytes: number }>();
    if (!row) throw new Error("Upload session was not found");

    const billing = await resolveBillingEntitlements(env, access.actorUserId, { privileged: access.canManageRoles });
    const quotaBytes = storageQuotaBytesForPlan(billing.plan, env);
    const usage = await storageUsage(db, access, quotaBytes);
    if (usage.usedBytes > quotaBytes) {
      throw new HttpError("File storage quota exceeded. Upgrade the plan or remove files before uploading.", 402, "STORAGE_QUOTA_EXCEEDED", {
        plan: billing.plan,
        quotaBytes,
        usedBytes: usage.usedBytes,
      });
    }

    const contentLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > row.size_bytes) {
      throw new Error("Upload payload is larger than the registered file size");
    }
    const uploadContentType = normalizeUploadMimeType(request.headers.get("content-type")) || row.mime_type;
    assertUploadFileAllowed({ name: row.original_name, size: row.size_bytes, mimeType: uploadContentType });

    await env.FILES_BUCKET.put(row.r2_key, request.body, {
      httpMetadata: {
        contentType: uploadContentType || "application/octet-stream",
      },
    });

    const now = new Date().toISOString();
    await db.prepare("UPDATE upload_sessions SET status = 'uploading', updated_at = ? WHERE id = ?").bind(now, sessionId).run();
    await db.prepare("UPDATE files SET status = 'uploading', updated_at = ? WHERE id = ?").bind(now, fileId).run();

    return okJson({ status: "uploaded", fileId, sessionId });
  } catch (error) {
    return routeError(error);
  }
};
