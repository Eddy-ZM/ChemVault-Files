import type { Env } from "../../../_lib/env";
import { appOkJson, appRouteError } from "../../../_lib/app-auth";
import { requireUserAuthProfile, loadUserAuthProfile } from "../../../_lib/user-auth";

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const user = requireUserAuthProfile(await loadUserAuthProfile(request, env), request, env);
    return appOkJson({ user });
  } catch (error) {
    return appRouteError(error);
  }
};
