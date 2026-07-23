import type { Env } from "../../_lib/env";
import { requireDb } from "../../_lib/db";
import { resolveBillingEntitlements, storageQuotaBytesForPlan } from "../../_lib/billing-entitlements";
import { storageUsage } from "../../_lib/drive-service";
import { HttpError, okJson, parseJsonBody, routeError } from "../../_lib/http";
import { canWriteFiles, permissionDeniedJson, resolveActorAccess } from "../../_lib/permissions";
import { checkInMemoryRateLimit, rateLimitClientId } from "../../_lib/rate-limit";
import {
  DIRECT_UPLOAD_MAX_BYTES,
  MULTIPART_UPLOAD_PART_SIZE_BYTES,
  assertUploadFileAllowed,
  normalizeUploadMimeType,
} from "../../../src/lib/chemvault-files/validation";

type UploadRow = {
  r2_key: string;
  original_name: string;
  mime_type: string | null;
  size_bytes: number;
};

type UploadedPart = {
  partNumber: number;
  etag: string;
};

const MAX_MULTIPART_PARTS = 10000;

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    if (!env.FILES_BUCKET) throw new Error("R2 binding FILES_BUCKET is not configured");
    const db = requireDb(env.FILES_DB);
    const access = await resolveActorAccess(request, env, db);
    if (!canWriteFiles(access)) return permissionDeniedJson(access, "write");
    const limited = checkInMemoryRateLimit({
      key: `files:multipart:${rateLimitClientId(request, access.actorEmail)}`,
      limit: 40,
      windowMs: 60 * 1000,
    });
    if (limited) return limited;

    const { fileId, sessionId } = parseFileSessionParams(request);
    const body = (await parseJsonBody(request)) as Record<string, unknown>;
    const action = typeof body.action === "string" ? body.action : "create";
    const row = await getUploadRow(db, fileId, sessionId);
    const uploadContentType = normalizeUploadMimeType(body.contentType) || row.mime_type;
    assertUploadFileAllowed({ name: row.original_name, size: row.size_bytes, mimeType: uploadContentType });

    if (action === "create") {
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

      const upload = await env.FILES_BUCKET.createMultipartUpload(row.r2_key, {
        httpMetadata: {
          contentType: uploadContentType || "application/octet-stream",
        },
      });
      const now = new Date().toISOString();
      await db.prepare("UPDATE upload_sessions SET mode = 'multipart', status = 'uploading', updated_at = ? WHERE id = ?").bind(now, sessionId).run();
      await db.prepare("UPDATE files SET status = 'uploading', updated_at = ? WHERE id = ?").bind(now, fileId).run();
      return okJson({
        status: "created",
        fileId,
        sessionId,
        uploadId: upload.uploadId,
        partSizeBytes: MULTIPART_UPLOAD_PART_SIZE_BYTES,
      });
    }

    const uploadId = requireUploadId(body.uploadId);
    const upload = env.FILES_BUCKET.resumeMultipartUpload(row.r2_key, uploadId);

    if (action === "complete") {
      const parts = parseUploadedParts(body.parts);
      await upload.complete(parts);
      const now = new Date().toISOString();
      await db.prepare("UPDATE upload_sessions SET status = 'uploading', updated_at = ? WHERE id = ?").bind(now, sessionId).run();
      await db.prepare("UPDATE files SET status = 'uploading', updated_at = ? WHERE id = ?").bind(now, fileId).run();
      return okJson({ status: "uploaded", fileId, sessionId });
    }

    if (action === "abort") {
      await upload.abort();
      const now = new Date().toISOString();
      await db.prepare("UPDATE upload_sessions SET status = 'aborted', updated_at = ? WHERE id = ?").bind(now, sessionId).run();
      await db.prepare("UPDATE files SET status = 'failed', updated_at = ? WHERE id = ?").bind(now, fileId).run();
      return okJson({ status: "aborted", fileId, sessionId });
    }

    throw new Error("Unsupported multipart upload action");
  } catch (error) {
    return routeError(error);
  }
};

export const onRequestPut: PagesFunction<Env> = async ({ request, env }) => {
  try {
    if (!env.FILES_BUCKET) throw new Error("R2 binding FILES_BUCKET is not configured");
    const db = requireDb(env.FILES_DB);
    const access = await resolveActorAccess(request, env, db);
    if (!canWriteFiles(access)) return permissionDeniedJson(access, "write");
    const limited = checkInMemoryRateLimit({
      key: `files:multipart-part:${rateLimitClientId(request, access.actorEmail)}`,
      limit: 240,
      windowMs: 60 * 1000,
    });
    if (limited) return limited;

    const url = new URL(request.url);
    const { fileId, sessionId } = parseFileSessionParams(request);
    const uploadId = requireUploadId(url.searchParams.get("uploadId"));
    const partNumber = parsePartNumber(url.searchParams.get("partNumber"));
    if (!request.body) throw new Error("Upload part body is required");

    const contentLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > DIRECT_UPLOAD_MAX_BYTES) {
      throw new Error("Upload part is too large");
    }

    const row = await getUploadRow(db, fileId, sessionId);
    const uploadContentType = normalizeUploadMimeType(request.headers.get("content-type")) || row.mime_type;
    assertUploadFileAllowed({ name: row.original_name, size: row.size_bytes, mimeType: uploadContentType });

    const upload = env.FILES_BUCKET.resumeMultipartUpload(row.r2_key, uploadId);
    const part = await upload.uploadPart(partNumber, request.body);
    return okJson({ partNumber: part.partNumber, etag: part.etag });
  } catch (error) {
    return routeError(error);
  }
};

function parseFileSessionParams(request: Request): { fileId: string; sessionId: string } {
  const url = new URL(request.url);
  const fileId = url.searchParams.get("fileId") || "";
  const sessionId = url.searchParams.get("sessionId") || "";
  if (!fileId || !sessionId) throw new Error("fileId and sessionId are required");
  return { fileId, sessionId };
}

async function getUploadRow(db: D1Database, fileId: string, sessionId: string): Promise<UploadRow> {
  const row = await db
    .prepare("SELECT r2_key, original_name, mime_type, size_bytes FROM files WHERE id = ? AND upload_session_id = ? AND deleted_at IS NULL")
    .bind(fileId, sessionId)
    .first<UploadRow>();
  if (!row) throw new Error("Upload session was not found");
  return row;
}

function requireUploadId(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 1024) {
    throw new Error("uploadId is required");
  }
  return value;
}

function parsePartNumber(value: unknown): number {
  const partNumber = Number(value);
  if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > MAX_MULTIPART_PARTS) {
    throw new Error("partNumber is invalid");
  }
  return partNumber;
}

function parseUploadedParts(value: unknown): UploadedPart[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_MULTIPART_PARTS) {
    throw new Error("Uploaded parts are required");
  }
  const seen = new Set<number>();
  const parts = value.map((entry) => {
    const part = entry as Record<string, unknown>;
    const partNumber = parsePartNumber(part.partNumber);
    if (seen.has(partNumber)) throw new Error("Uploaded parts contain duplicate part numbers");
    seen.add(partNumber);
    const etag = typeof part.etag === "string" ? part.etag : "";
    if (!etag) throw new Error("Uploaded part etag is required");
    return { partNumber, etag };
  });
  return parts.sort((left, right) => left.partNumber - right.partNumber);
}
