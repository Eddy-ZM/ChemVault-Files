import type { Env } from "./env";
import { HttpError } from "./http";
import type { UserAuthProfile } from "./user-auth";

export interface AppSessionTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: "Bearer";
  expiresIn: number;
  refreshExpiresIn: number;
}

export interface AppSessionPayload {
  type: "access" | "refresh";
  sub: string;
  email: string;
  name: string | null;
  role: string;
  systemRole: string;
  permissions: string[];
  services: string[];
  serviceAllowed: boolean;
  serviceReason: string | null;
  iat: number;
  exp: number;
}

const tokenPrefix = "cv1";
const accessTtlSeconds = 60 * 60;
const refreshTtlSeconds = 60 * 60 * 24 * 30;
const encoder = new TextEncoder();

export async function createAppSessionTokens(user: UserAuthProfile, env: Env, now = new Date()): Promise<AppSessionTokens> {
  const issuedAt = Math.floor(now.getTime() / 1000);
  const accessPayload = payloadFromUser(user, "access", issuedAt, issuedAt + accessTtlSeconds);
  const refreshPayload = payloadFromUser(user, "refresh", issuedAt, issuedAt + refreshTtlSeconds);
  return {
    accessToken: await signToken(accessPayload, env),
    refreshToken: await signToken(refreshPayload, env),
    tokenType: "Bearer",
    expiresIn: accessTtlSeconds,
    refreshExpiresIn: refreshTtlSeconds,
  };
}

export async function verifyAppSessionToken(token: string, env: Env, expectedType: AppSessionPayload["type"], now = new Date()): Promise<AppSessionPayload> {
  const [prefix, encodedPayload, encodedSignature] = token.split(".");
  if (prefix !== tokenPrefix || !encodedPayload || !encodedSignature) {
    throw new HttpError("Please sign in again.", 401, "UNAUTHORIZED");
  }

  const signature = await hmac(encodedPayload, env);
  if (signature !== encodedSignature) {
    throw new HttpError("Please sign in again.", 401, "UNAUTHORIZED");
  }

  let payload: AppSessionPayload;
  try {
    payload = JSON.parse(base64UrlDecodeText(encodedPayload)) as AppSessionPayload;
  } catch {
    throw new HttpError("Please sign in again.", 401, "UNAUTHORIZED");
  }

  if (payload.type !== expectedType || !payload.email || !payload.sub) {
    throw new HttpError("Please sign in again.", 401, "UNAUTHORIZED");
  }
  if (payload.exp <= Math.floor(now.getTime() / 1000)) {
    throw new HttpError("Session expired. Please sign in again.", 401, "SESSION_EXPIRED");
  }

  return payload;
}

export function appSessionPayloadToUser(payload: AppSessionPayload): UserAuthProfile {
  return {
    id: payload.sub,
    email: payload.email,
    name: payload.name,
    role: payload.role,
    systemRole: payload.systemRole,
    permissions: payload.permissions,
    services: payload.services,
    serviceAllowed: payload.serviceAllowed,
    serviceReason: payload.serviceReason,
  };
}

export function readBearerToken(request: Request): string | null {
  const authorization = request.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export function appOkJson(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify({ ok: true, data }), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...init.headers,
    },
  });
}

export function appErrorJson(message: string, status = 400, code = "BAD_REQUEST", details?: Record<string, unknown>): Response {
  return new Response(JSON.stringify({ ok: false, error: { code, message, ...(details ?? {}) } }), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });
}

export function appRouteError(error: unknown): Response {
  if (error instanceof HttpError) return appErrorJson(error.message, error.status, error.code, error.details);
  const message = error instanceof Error ? error.message : "Unexpected server error";
  return appErrorJson(message, message.includes("not configured") ? 503 : 400);
}

function payloadFromUser(user: UserAuthProfile, type: AppSessionPayload["type"], iat: number, exp: number): AppSessionPayload {
  return {
    type,
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    systemRole: user.systemRole,
    permissions: user.permissions,
    services: user.services,
    serviceAllowed: user.serviceAllowed,
    serviceReason: user.serviceReason,
    iat,
    exp,
  };
}

async function signToken(payload: AppSessionPayload, env: Env): Promise<string> {
  const encodedPayload = base64UrlEncodeText(JSON.stringify(payload));
  const signature = await hmac(encodedPayload, env);
  return `${tokenPrefix}.${encodedPayload}.${signature}`;
}

async function hmac(value: string, env: Env): Promise<string> {
  const secret = sessionSecret(env);
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return base64UrlEncodeBytes(new Uint8Array(signature));
}

function sessionSecret(env: Env): string {
  const secret = env.APP_SESSION_SECRET || env.JWT_SECRET;
  if (secret && secret.length >= 32) return secret;
  if (env.ENVIRONMENT !== "production") return "dev-only-chemvault-files-app-session-secret";
  throw new HttpError("App session secret is not configured.", 503, "APP_SESSION_SECRET_MISSING");
}

function base64UrlEncodeText(value: string): string {
  return base64UrlEncodeBytes(encoder.encode(value));
}

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const encoded = typeof btoa === "function" ? btoa(binary) : Buffer.from(bytes).toString("base64");
  return encoded.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecodeText(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  if (typeof atob === "function") {
    return decodeURIComponent(
      Array.from(atob(padded))
        .map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, "0")}`)
        .join("")
    );
  }
  return Buffer.from(padded, "base64").toString("utf8");
}
