import { describe, expect, it } from "vitest";
import { appSessionPayloadToUser, createAppSessionTokens, verifyAppSessionToken } from "../functions/_lib/app-auth";
import { onRequestGet as appLogin } from "../functions/api/app/auth/login";
import type { UserAuthProfile } from "../functions/_lib/user-auth";

const user: UserAuthProfile = {
  id: "user_1",
  email: "owner@chemvault.science",
  name: "Owner",
  role: "admin",
  systemRole: "owner",
  permissions: ["file:read", "file:upload"],
  services: ["chemvault_file"],
  serviceAllowed: true,
  serviceReason: null,
};

describe("app auth tokens", () => {
  it("creates signed access and refresh tokens", async () => {
    const env = { APP_SESSION_SECRET: "12345678901234567890123456789012", ENVIRONMENT: "production" };
    const tokens = await createAppSessionTokens(user, env);

    const accessPayload = await verifyAppSessionToken(tokens.accessToken, env, "access");
    const refreshPayload = await verifyAppSessionToken(tokens.refreshToken, env, "refresh");

    expect(accessPayload.email).toBe(user.email);
    expect(refreshPayload.type).toBe("refresh");
    expect(appSessionPayloadToUser(accessPayload)).toMatchObject({ email: user.email, systemRole: "owner" });
  });

  it("rejects tokens signed with another secret", async () => {
    const env = { APP_SESSION_SECRET: "12345678901234567890123456789012", ENVIRONMENT: "production" };
    const tokens = await createAppSessionTokens(user, env);

    await expect(
      verifyAppSessionToken(tokens.accessToken, { APP_SESSION_SECRET: "abcdefghijklmnopqrstuvwxzy123456", ENVIRONMENT: "production" }, "access")
    ).rejects.toMatchObject({ status: 401, code: "UNAUTHORIZED" });
  });

  it("keeps the app login bridge as the SSO return target", async () => {
    const request = new Request("https://file.chemvault.science/api/app/auth/login?redirect_uri=chemvaultfiles%3A%2F%2Fauth");
    const response = await appLogin({
      request,
      env: { USER_AUTH_ORIGIN: "https://user.chemvault.science", USER_LOGIN_URL: "/login", ENVIRONMENT: "production" },
    } as never);

    expect(response.status).toBe(302);
    const location = response.headers.get("location");
    expect(location).toContain("https://user.chemvault.science/login");
    expect(new URL(location!).searchParams.get("returnTo")).toBe(request.url);
  });
});
