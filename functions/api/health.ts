import type { Env } from "../_lib/env";
import { hasRequiredBindings } from "../_lib/env";
import { requireDb } from "../_lib/db";
import { defaultRolePolicies, listRolePolicies, resolveActorAccessForUserAuth, resolveActorAccessFromRoles } from "../_lib/permissions";
import { getDevelopmentActorEmail, getUserLoginUrl, loadUserAuthProfile } from "../_lib/user-auth";
import { okJson } from "../_lib/http";

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const bindings = hasRequiredBindings(env);
  const roles = bindings.d1
    ? await listRolePolicies(requireDb(env.FILES_DB), env)
    : defaultRolePolicies(env);
  const user = await loadUserAuthProfile(request, env);
  const developmentEmail = user ? null : getDevelopmentActorEmail(request, env);
  const actorAccess = user
    ? resolveActorAccessForUserAuth(user, env.PRIVATE_OWNER_EMAIL, roles, env.FILES_ADMIN_EMAILS)
    : developmentEmail
      ? resolveActorAccessFromRoles(developmentEmail, env.PRIVATE_OWNER_EMAIL, roles, env.FILES_ADMIN_EMAILS)
      : null;
  const authStatus = actorAccess ? (actorAccess.permission === "none" ? "forbidden" : "authenticated") : "unauthenticated";
  return okJson({
    status: bindings.d1 && bindings.r2 ? "ready" : "configuration-missing",
    api: "online",
    d1: bindings.d1 ? "online" : "missing",
    r2: bindings.r2 ? "online" : "missing",
    environment: env.ENVIRONMENT || "local",
    authStatus,
    loginUrl: getUserLoginUrl(request, env),
    actorEmail: actorAccess?.actorEmail ?? null,
    actorAccess,
  });
};
