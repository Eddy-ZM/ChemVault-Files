import { requireDb } from "../../_lib/db";
import type { Env } from "../../_lib/env";
import { storageUsage } from "../../_lib/drive-service";
import { okJson, routeError } from "../../_lib/http";
import { canReadFiles, permissionDeniedJson, resolveActorAccess } from "../../_lib/permissions";
import { ensureDriveAppSchema } from "../../_lib/schema";
import { resolveBillingEntitlements, storageQuotaBytesForPlan } from "../../_lib/billing-entitlements";

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const db = requireDb(env.FILES_DB);
    await ensureDriveAppSchema(db);
    const access = await resolveActorAccess(request, env, db);
    if (!canReadFiles(access)) return permissionDeniedJson(access, "read");

    const billing = await resolveBillingEntitlements(env, access.actorUserId, { privileged: access.canManageRoles });
    const quotaBytes = storageQuotaBytesForPlan(billing.plan, env);
    const usage = await storageUsage(db, access, quotaBytes);
    return okJson({ ...usage, plan: billing.plan, billingSource: billing.source, billingEnforced: billing.enforced });
  } catch (error) {
    return routeError(error);
  }
};
