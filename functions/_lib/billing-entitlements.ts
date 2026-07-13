import type { Env } from "./env";
import { HttpError } from "./http";

export type BillingPlan = "anonymous" | "free" | "pro" | "team" | "enterprise" | "admin";
export type BillingEnforcementMode = "off" | "shadow" | "enforce";

export interface BillingEntitlements {
  plan: BillingPlan;
  source: "billing" | "privileged" | "disabled" | "fallback";
  enforced: boolean;
  features: Record<string, boolean>;
}

const validPlans = new Set<BillingPlan>(["anonymous", "free", "pro", "team", "enterprise", "admin"]);
const defaultQuotas: Record<BillingPlan, number> = {
  anonymous: 0,
  free: 100 * 1024 * 1024,
  pro: 10 * 1024 * 1024 * 1024,
  team: 100 * 1024 * 1024 * 1024,
  enterprise: 1024 * 1024 * 1024 * 1024,
  admin: 1024 * 1024 * 1024 * 1024,
};

export async function resolveBillingEntitlements(
  env: Env,
  userId: string | undefined,
  { privileged = false }: { privileged?: boolean } = {},
): Promise<BillingEntitlements> {
  if (privileged) return { plan: "admin", source: "privileged", enforced: true, features: {} };

  const mode = billingEnforcementMode(env);
  if (mode === "off") return { plan: "free", source: "disabled", enforced: false, features: {} };

  const cleanUserId = userId?.trim() || "";
  const secret = env.BILLING_SERVICE_SECRET?.trim() || "";
  if (!cleanUserId || !secret) {
    if (mode === "enforce") {
      throw new HttpError(
        cleanUserId ? "Billing entitlement service is not configured." : "Verified billing identity is required.",
        cleanUserId ? 503 : 401,
        cleanUserId ? "BILLING_UNAVAILABLE" : "BILLING_IDENTITY_REQUIRED",
      );
    }
    return { plan: "free", source: "fallback", enforced: false, features: {} };
  }

  const origin = billingOrigin(env);
  let response: Response;
  try {
    response = await fetch(`${origin}/api/internal/billing/entitlements?userId=${encodeURIComponent(cleanUserId)}`, {
      headers: { accept: "application/json", authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    if (mode === "enforce") throw new HttpError("Billing entitlement service is unavailable.", 503, "BILLING_UNAVAILABLE");
    return { plan: "free", source: "fallback", enforced: false, features: {} };
  }

  const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
  const plan = normalizePlan(payload?.plan);
  if (!response.ok || payload?.ok !== true || payload?.userId !== cleanUserId || !plan) {
    if (mode === "enforce") throw new HttpError("Billing entitlement could not be verified.", 503, "BILLING_INVALID_RESPONSE");
    return { plan: "free", source: "fallback", enforced: false, features: {} };
  }

  return {
    plan,
    source: "billing",
    enforced: mode === "enforce",
    features: normalizeFeatures(payload.features),
  };
}

export function storageQuotaBytesForPlan(plan: BillingPlan, env: Env): number {
  const configured = plan === "free"
    ? env.FILE_STORAGE_FREE_QUOTA_BYTES
    : plan === "pro"
      ? env.FILE_STORAGE_PRO_QUOTA_BYTES
      : plan === "team"
        ? env.FILE_STORAGE_TEAM_QUOTA_BYTES
        : plan === "enterprise" || plan === "admin"
          ? env.FILE_STORAGE_ENTERPRISE_QUOTA_BYTES
          : undefined;
  const legacy = plan === "admin" ? env.FILE_STORAGE_QUOTA_BYTES : undefined;
  return positiveInteger(configured ?? legacy) ?? defaultQuotas[plan];
}

export function billingEnforcementMode(env: Env): BillingEnforcementMode {
  const configured = env.BILLING_ENFORCEMENT_MODE?.trim().toLowerCase();
  if (configured === "off" || configured === "shadow" || configured === "enforce") return configured;
  return env.ENVIRONMENT?.trim().toLowerCase() === "production" ? "enforce" : "shadow";
}

function billingOrigin(env: Env): string {
  const raw = (env.BILLING_API_ORIGIN || "https://chemvault.science").trim().replace(/\/+$/, "");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new HttpError("Billing API origin is invalid.", 503, "BILLING_UNAVAILABLE");
  }
  if (env.ENVIRONMENT?.trim().toLowerCase() === "production" && url.protocol !== "https:") {
    throw new HttpError("Billing API origin must use HTTPS.", 503, "BILLING_UNAVAILABLE");
  }
  return url.toString().replace(/\/+$/, "");
}

function normalizePlan(value: unknown): BillingPlan | null {
  if (typeof value !== "string") return null;
  const plan = value.trim().toLowerCase() as BillingPlan;
  return validPlans.has(plan) ? plan : null;
}

function normalizeFeatures(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, boolean] => typeof entry[1] === "boolean"));
}

function positiveInteger(value: string | undefined): number | null {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}
