import type { Env } from "../../_lib/env";
import { loadVisibleFile } from "../../_lib/drive-service";
import { parseJsonBody, routeError } from "../../_lib/http";
import { canReadFiles, permissionDeniedJson, resolveActorAccess } from "../../_lib/permissions";
import { ensureDriveAppSchema } from "../../_lib/schema";
import { buildZipArchive } from "../../_lib/zip";
import { requireDb } from "../../_lib/db";

type BulkDownloadBody = {
  fileIds?: unknown;
};

const maxBulkFiles = 50;
const maxBulkBytes = 250 * 1024 * 1024;

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const db = requireDb(env.FILES_DB);
    const bucket = env.FILES_BUCKET;
    if (!bucket) return Response.json({ error: { message: "Files bucket is not configured" } }, { status: 500 });

    await ensureDriveAppSchema(db);
    const access = await resolveActorAccess(request, env, db);
    if (!canReadFiles(access)) return permissionDeniedJson(access, "read");

    const body = (await parseJsonBody(request)) as BulkDownloadBody;
    const fileIds = normalizeFileIds(body.fileIds);
    if (fileIds.length === 0) return Response.json({ error: { message: "Choose at least one file to download." } }, { status: 400 });
    if (fileIds.length > maxBulkFiles) return Response.json({ error: { message: `Bulk downloads are limited to ${maxBulkFiles} files.` } }, { status: 413 });

    const files = [];
    let totalBytes = 0;
    for (const fileId of fileIds) {
      const file = await loadVisibleFile(db, fileId, access);
      if (!file) return Response.json({ error: { message: "One or more files were not found." } }, { status: 404 });
      if (file.status !== "ready") return Response.json({ error: { message: `${file.displayName} is not ready for download.` } }, { status: 409 });
      if (file.scanStatus !== "clean") return Response.json({ error: { message: `${file.displayName} is under content and application code review until it is cleared.` } }, { status: 423 });
      totalBytes += file.sizeBytes;
      if (totalBytes > maxBulkBytes) {
        return Response.json({ error: { message: "Bulk download is larger than the 250 MB limit." } }, { status: 413 });
      }
      files.push(file);
    }

    const entries = [];
    for (const file of files) {
      const object = await bucket.get(file.r2Key);
      if (!object) return Response.json({ error: { message: `${file.displayName} could not be read from storage.` } }, { status: 404 });
      entries.push({
        name: file.displayName,
        bytes: new Uint8Array(await object.arrayBuffer()),
        modifiedAt: file.updatedAt,
      });
    }

    const zip = buildZipArchive(entries);
    const headers = new Headers();
    headers.set("content-type", "application/zip");
    headers.set("content-length", String(zip.byteLength));
    headers.set("content-disposition", `attachment; filename="${archiveName()}"`);
    headers.set("x-content-type-options", "nosniff");
    const responseBody = new ArrayBuffer(zip.byteLength);
    new Uint8Array(responseBody).set(zip);
    return new Response(responseBody, { headers });
  } catch (error) {
    return routeError(error);
  }
};

function normalizeFileIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const fileIds: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const fileId = entry.trim();
    if (!/^[a-zA-Z0-9_-]{1,160}$/.test(fileId) || seen.has(fileId)) continue;
    seen.add(fileId);
    fileIds.push(fileId);
  }
  return fileIds;
}

function archiveName(): string {
  return `chemvault-files-${new Date().toISOString().slice(0, 10)}.zip`;
}
