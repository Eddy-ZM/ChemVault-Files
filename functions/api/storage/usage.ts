import { requireDb } from "../../_lib/db";
import type { Env } from "../../_lib/env";
import { readStorageQuotaBytes, storageUsage } from "../../_lib/drive-service";
import { okJson, routeError } from "../../_lib/http";
import { canReadFiles, permissionDeniedJson, resolveActorAccess } from "../../_lib/permissions";
import { ensureDriveAppSchema } from "../../_lib/schema";

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const db = requireDb(env.FILES_DB);
    await ensureDriveAppSchema(db);
    const access = await resolveActorAccess(request, env, db);
    if (!canReadFiles(access)) return permissionDeniedJson(access, "read");

    const quotaBytes = readStorageQuotaBytes(env.FILE_STORAGE_QUOTA_BYTES);
    const usage = await storageUsage(db, access, quotaBytes);
    return okJson(usage);
  } catch (error) {
    return routeError(error);
  }
};
