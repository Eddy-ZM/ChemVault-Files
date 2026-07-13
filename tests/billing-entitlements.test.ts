import { afterEach, describe, expect, it, vi } from "vitest";
import {
  billingEnforcementMode,
  resolveBillingEntitlements,
  storageQuotaBytesForPlan,
} from "../functions/_lib/billing-entitlements";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("billing entitlements", () => {
  it("uses published plan storage quotas by default", () => {
    expect(storageQuotaBytesForPlan("free", {})).toBe(100 * 1024 * 1024);
    expect(storageQuotaBytesForPlan("pro", {})).toBe(10 * 1024 * 1024 * 1024);
    expect(storageQuotaBytesForPlan("team", {})).toBe(100 * 1024 * 1024 * 1024);
  });

  it("defaults production to enforced mode and local development to shadow mode", () => {
    expect(billingEnforcementMode({ ENVIRONMENT: "production" })).toBe("enforce");
    expect(billingEnforcementMode({ ENVIRONMENT: "development" })).toBe("shadow");
  });

  it("fails closed in production when the service secret is missing", async () => {
    await expect(resolveBillingEntitlements({ ENVIRONMENT: "production" }, "user_1")).rejects.toMatchObject({
      status: 503,
      code: "BILLING_UNAVAILABLE",
    });
  });

  it("uses the server-resolved plan and validates the echoed user", async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify({
      ok: true,
      userId: "user_1",
      plan: "pro",
      features: { "file_library.storage.pro": true },
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveBillingEntitlements({
      ENVIRONMENT: "production",
      BILLING_SERVICE_SECRET: "server_secret",
      BILLING_API_ORIGIN: "https://chemvault.science",
    }, "user_1");

    expect(result).toMatchObject({ plan: "pro", source: "billing", enforced: true });
    expect(result.features["file_library.storage.pro"]).toBe(true);
    const request = fetchMock.mock.calls[0];
    expect(String(request[0])).toContain("userId=user_1");
    expect(new Headers(request[1]?.headers).get("authorization")).toBe("Bearer server_secret");
  });

  it("does not accept a billing response for another user", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      userId: "user_2",
      plan: "team",
      features: {},
    }), { status: 200, headers: { "content-type": "application/json" } })));

    await expect(resolveBillingEntitlements({
      ENVIRONMENT: "production",
      BILLING_SERVICE_SECRET: "server_secret",
    }, "user_1")).rejects.toMatchObject({ status: 503, code: "BILLING_INVALID_RESPONSE" });
  });
});
