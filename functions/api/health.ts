import type { Env } from "../_lib/env";
import { getActorEmail, hasRequiredBindings } from "../_lib/env";
import { requireDb } from "../_lib/db";
import { defaultRolePolicies, listRolePolicies, resolveActorAccessFromRoles } from "../_lib/permissions";
import { okJson } from "../_lib/http";

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const bindings = hasRequiredBindings(env);
  const actorEmail = getActorEmail(request, env);
  const roles = bindings.d1
    ? await listRolePolicies(requireDb(env.FILES_DB), env)
    : defaultRolePolicies(env);
  const actorAccess = resolveActorAccessFromRoles(actorEmail, env.PRIVATE_OWNER_EMAIL, roles, env.FILES_ADMIN_EMAILS);
  return okJson({
    status: bindings.d1 && bindings.r2 ? "ready" : "configuration-missing",
    api: "online",
    d1: bindings.d1 ? "online" : "missing",
    r2: bindings.r2 ? "online" : "missing",
    environment: env.ENVIRONMENT || "local",
    actorEmail,
    actorAccess,
  });
};
