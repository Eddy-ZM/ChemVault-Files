import type { Env } from "../../../_lib/env";
import { appErrorJson, appRouteError, createAppSessionTokens } from "../../../_lib/app-auth";
import { getUserAuthOrigin, loadUserAuthProfile } from "../../../_lib/user-auth";

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const url = new URL(request.url);
    const redirectUri = normalizeAppRedirectUri(url.searchParams.get("redirect_uri"));
    if (!redirectUri) return appErrorJson("redirect_uri is required.", 400, "INVALID_REDIRECT_URI");

    const user = await loadUserAuthProfile(request, env);
    if (!user) {
      return Response.redirect(getAppUserLoginUrl(request, env), 302);
    }

    const tokens = await createAppSessionTokens(user, env);
    const callback = new URL(redirectUri);
    callback.searchParams.set("access_token", tokens.accessToken);
    callback.searchParams.set("refresh_token", tokens.refreshToken);
    callback.searchParams.set("token_type", tokens.tokenType);
    callback.searchParams.set("expires_in", String(tokens.expiresIn));
    callback.searchParams.set("refresh_expires_in", String(tokens.refreshExpiresIn));
    callback.searchParams.set("email", user.email);
    return Response.redirect(callback.toString(), 302);
  } catch (error) {
    return appRouteError(error);
  }
};

function getAppUserLoginUrl(request: Request, env: Pick<Env, "USER_AUTH_ORIGIN" | "USER_LOGIN_URL">): string {
  const url = new URL(env.USER_LOGIN_URL || "/login", getUserAuthOrigin(env));
  url.searchParams.set("returnTo", request.url);
  return url.toString();
}

function normalizeAppRedirectUri(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol === "chemvaultfiles:") return url.toString();
    if ((url.hostname === "127.0.0.1" || url.hostname === "localhost") && (url.protocol === "http:" || url.protocol === "https:")) {
      return url.toString();
    }
  } catch {
    return null;
  }
  return null;
}
