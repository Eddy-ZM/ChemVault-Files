export interface Env {
  FILES_DB?: D1Database;
  FILES_BUCKET?: R2Bucket;
  PRIVATE_OWNER_EMAIL?: string;
  FILES_ADMIN_EMAILS?: string;
  USER_AUTH_ORIGIN?: string;
  USER_LOGIN_URL?: string;
  COOKIE_NAME?: string;
  COOKIE_DOMAIN?: string;
  ENVIRONMENT?: string;
  FILE_STORAGE_QUOTA_BYTES?: string;
  FILE_STORAGE_FREE_QUOTA_BYTES?: string;
  FILE_STORAGE_PRO_QUOTA_BYTES?: string;
  FILE_STORAGE_TEAM_QUOTA_BYTES?: string;
  FILE_STORAGE_ENTERPRISE_QUOTA_BYTES?: string;
  BILLING_API_ORIGIN?: string;
  BILLING_SERVICE_SECRET?: string;
  BILLING_ENFORCEMENT_MODE?: string;
  ALLOWED_APP_ORIGINS?: string;
  APP_SESSION_SECRET?: string;
  JWT_SECRET?: string;
  LIFECYCLE_SERVICE_SECRET?: string;
  LAB_HANDOFF_SECRET?: string;
  FILE_SCAN_CALLBACK_SECRET?: string;
  ARTIFACT_WRITE_SECRET?: string;
}

export function hasRequiredBindings(env: Env): { d1: boolean; r2: boolean } {
  return {
    d1: Boolean(env.FILES_DB),
    r2: Boolean(env.FILES_BUCKET),
  };
}

export function normalizeEmailCandidate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export function readCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  for (const pair of cookieHeader.split(";")) {
    const [rawKey, ...rawValue] = pair.trim().split("=");
    if (rawKey === name) return rawValue.join("=") || null;
  }
  return null;
}
