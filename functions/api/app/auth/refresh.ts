import type { Env } from "../../../_lib/env";
import { appOkJson, appRouteError, appSessionPayloadToUser, createAppSessionTokens, verifyAppSessionToken } from "../../../_lib/app-auth";
import { parseJsonBody } from "../../../_lib/http";

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const body = (await parseJsonBody(request)) as Record<string, unknown>;
    const refreshToken = typeof body.refreshToken === "string" ? body.refreshToken : "";
    const payload = await verifyAppSessionToken(refreshToken, env, "refresh");
    const user = appSessionPayloadToUser(payload);
    const tokens = await createAppSessionTokens(user, env);
    return appOkJson({ user, ...tokens });
  } catch (error) {
    return appRouteError(error);
  }
};
