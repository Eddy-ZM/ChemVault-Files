export interface Env {
  FILES_DB?: D1Database;
  FILES_BUCKET?: R2Bucket;
  PRIVATE_OWNER_EMAIL?: string;
  FILES_ADMIN_EMAILS?: string;
  ENVIRONMENT?: string;
}

export function getActorEmail(request: Request, env: Env): string {
  return (
    normalizeEmailCandidate(request.headers.get("Cf-Access-Authenticated-User-Email")) ??
    readAccessJwtEmail(request) ??
    normalizeEmailCandidate(env.PRIVATE_OWNER_EMAIL) ??
    "owner@chemvault.science"
  );
}

export function hasRequiredBindings(env: Env): { d1: boolean; r2: boolean } {
  return {
    d1: Boolean(env.FILES_DB),
    r2: Boolean(env.FILES_BUCKET),
  };
}

function readAccessJwtEmail(request: Request): string | null {
  const token = request.headers.get("Cf-Access-Jwt-Assertion") || readCookie(request.headers.get("cookie"), "CF_Authorization");
  if (!token) return null;
  const payload = token.split(".")[1];
  if (!payload) return null;

  try {
    const json = JSON.parse(decodeBase64Url(payload)) as { email?: unknown };
    return normalizeEmailCandidate(json.email);
  } catch {
    return null;
  }
}

function normalizeEmailCandidate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function readCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  for (const pair of cookieHeader.split(";")) {
    const [rawKey, ...rawValue] = pair.trim().split("=");
    if (rawKey === name) return rawValue.join("=") || null;
  }
  return null;
}

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  return atob(padded);
}
