import { requireDb } from "../../../_lib/db";
import { normalizeEmailCandidate, type Env } from "../../../_lib/env";
import { errorJson, okJson, routeError } from "../../../_lib/http";
import { ensureDriveAppSchema } from "../../../_lib/schema";
import { buildR2Key } from "../../../../src/lib/chemvault-files/r2-key";
import { sanitizeVisibleName } from "../../../../src/lib/chemvault-files/validation";

const maxArtifactBytes = 50 * 1024 * 1024;

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const authorization = request.headers.get("authorization") || "";
    if (!env.ARTIFACT_WRITE_SECRET || authorization !== `Bearer ${env.ARTIFACT_WRITE_SECRET}`) {
      return errorJson("Unauthorized artifact writer.", 401, "UNAUTHORIZED");
    }
    if (!env.FILES_BUCKET) return errorJson("Files bucket is not configured.", 503, "STORAGE_UNAVAILABLE");

    const actorEmail = normalizeEmailCandidate(request.headers.get("x-chemvault-user-email"));
    const sourceFileId = (request.headers.get("x-chemvault-source-file-id") || "").trim();
    const sourceUserId = (request.headers.get("x-chemvault-user-id") || "").trim().slice(0, 160);
    const analysisId = (request.headers.get("x-chemvault-analysis-id") || "").trim().slice(0, 160);
    const artifactKind = (request.headers.get("x-chemvault-artifact-kind") || "").trim().slice(0, 40);
    if (!actorEmail || !sourceFileId || !analysisId || !artifactKind) {
      return errorJson("Verified user, source file, analysis, and artifact kind are required.", 400, "VALIDATION_ERROR");
    }
    if (!request.body) return errorJson("Artifact body is required.", 400, "VALIDATION_ERROR");

    const db = requireDb(env.FILES_DB);
    await ensureDriveAppSchema(db);
    const source = await db
      .prepare(
        "SELECT project_id, folder_id, actor_email FROM files WHERE id = ? AND lower(actor_email) = ? AND status = 'ready' AND COALESCE(scan_status, 'clean') = 'clean' AND deleted_at IS NULL",
      )
      .bind(sourceFileId, actorEmail)
      .first<{ project_id: string; folder_id: string | null; actor_email: string }>();
    if (!source) return errorJson("Owned, scan-cleared source file was not found.", 404, "SOURCE_FILE_NOT_FOUND");

    const project = await db.prepare("SELECT slug FROM projects WHERE id = ?").bind(source.project_id).first<{ slug: string }>();
    if (!project) return errorJson("Source project was not found.", 404, "PROJECT_NOT_FOUND");

    const bytes = await request.arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength > maxArtifactBytes) {
      return errorJson("Artifact must be between 1 byte and 50 MB.", 413, "ARTIFACT_SIZE_INVALID");
    }
    const encodedName = request.headers.get("x-chemvault-artifact-name") || "";
    let requestedName = encodedName;
    try {
      requestedName = decodeURIComponent(encodedName);
    } catch {
      requestedName = encodedName;
    }
    const displayName = sanitizeVisibleName(requestedName || `${analysisId}-${artifactKind}`);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const r2Key = buildR2Key({ projectSlug: project.slug, fileId: id, originalName: displayName, now: new Date(now) });
    const contentType = (request.headers.get("content-type") || "application/octet-stream").slice(0, 180);
    const metadata = {
      schemaVersion: "chemvault.artifact.v1",
      generatedBy: "chemvault-lab",
      artifactKind,
      analysisId,
      sourceFileId,
      sourceUserId: sourceUserId || null,
      generatedAt: now,
    };

    await env.FILES_BUCKET.put(r2Key, bytes, {
      httpMetadata: { contentType },
      customMetadata: { sourceFileId, analysisId, artifactKind },
    });
    await db
      .prepare(
        `INSERT INTO files (
          id, project_id, folder_id, display_name, original_name, r2_key, mime_type,
          size_bytes, status, checksum, upload_session_id, actor_email, download_count,
          visibility, created_at, updated_at, deleted_at, owner_user_id, parent_id,
          shared_status, metadata_json, scan_status, scan_detail, scanned_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ready', NULL, NULL, ?, 0, 'private', ?, ?, NULL, ?, ?, 'private', ?, 'clean', ?, ?)`,
      )
      .bind(
        id,
        source.project_id,
        source.folder_id,
        displayName,
        displayName,
        r2Key,
        contentType,
        bytes.byteLength,
        actorEmail,
        now,
        now,
        actorEmail,
        source.folder_id,
        JSON.stringify(metadata),
        "Trusted server-generated artifact.",
        now,
      )
      .run();

    return okJson(
      {
        artifact: {
          id,
          name: displayName,
          artifactKind,
          sourceFileId,
          analysisId,
          sizeBytes: bytes.byteLength,
          scanStatus: "clean",
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return routeError(error);
  }
};
