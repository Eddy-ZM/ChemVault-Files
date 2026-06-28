import type { Env } from "../../_lib/env";
import { okJson, routeError } from "../../_lib/http";
import { getUserAuthOrigin, getUserLoginUrl, getUserLogoutCookie } from "../../_lib/user-auth";

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const cookie = request.headers.get("cookie") || "";
    if (cookie) {
      await fetch(`${getUserAuthOrigin(env)}/api/auth/logout`, {
        method: "POST",
        headers: {
          accept: "application/json",
          cookie,
        },
      }).catch(() => null);
    }

    return okJson(
      { ok: true, loginUrl: getUserLoginUrl(request, env) },
      { headers: { "Set-Cookie": getUserLogoutCookie(env, request) } }
    );
  } catch (error) {
    return routeError(error);
  }
};
