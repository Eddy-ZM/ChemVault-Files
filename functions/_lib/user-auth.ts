import type { FilePermissionLevel } from "../../src/lib/chemvault-files/types";
import type { Env } from "./env";
import { normalizeEmailCandidate, readCookie } from "./env";
import { HttpError } from "./http";
import { appSessionPayloadToUser, readBearerToken, verifyAppSessionToken } from "./app-auth";

export interface UserAuthProfile {
  id: string;
  email: string;
  name: string | null;
  role: string;
  systemRole: string;
  permissions: string[];
  services: string[];
  serviceAllowed: boolean;
  serviceReason: string | null;
}

interface UserCenterMeResponse {
  user?: {
    id?: unknown;
    email?: unknown;
    name?: unknown;
    role?: unknown;
    systemRole?: unknown;
    permissions?: unknown;
    services?: unknown;
  };
}

interface UserCenterAccessResponse {
  allowed?: unknown;
  reason?: unknown;
}

const defaultUserAuthOrigin = "https://user.chemvault.science";
const defaultCookieName = "chemvault_session";
const fileServiceKey = "chemvault_file";
const localActorHeader = "X-ChemVault-User-Email";

export function getCookieName(env: Pick<Env, "COOKIE_NAME">): string {
  return env.COOKIE_NAME || defaultCookieName;
}

export function getUserAuthOrigin(env: Pick<Env, "USER_AUTH_ORIGIN">): string {
  return (env.USER_AUTH_ORIGIN || defaultUserAuthOrigin).replace(/\/+$/, "");
}

export function getUserLoginUrl(request: Request, env: Pick<Env, "USER_AUTH_ORIGIN" | "USER_LOGIN_URL">): string {
  const url = new URL(env.USER_LOGIN_URL || "/login", getUserAuthOrigin(env));
  url.searchParams.set("returnTo", resolveLoginReturnTo(request));
  return url.toString();
}

function resolveLoginReturnTo(request: Request): string {
  const requestUrl = new URL(request.url);
  const explicitReturnTo = normalizeReturnToCandidate(requestUrl, requestUrl.searchParams.get("returnTo"));
  if (explicitReturnTo) return explicitReturnTo;
  if (isApiPath(requestUrl.pathname)) return `${requestUrl.origin}/`;
  return requestUrl.toString();
}

function normalizeReturnToCandidate(requestUrl: URL, value: string | null): string | null {
  if (!value) return null;
  try {
    const candidate = new URL(value, requestUrl.origin);
    if (candidate.origin !== requestUrl.origin || isApiPath(candidate.pathname)) return null;
    return candidate.toString();
  } catch {
    return null;
  }
}

function isApiPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

export function getUserLogoutCookie(env: Pick<Env, "COOKIE_NAME" | "COOKIE_DOMAIN">, request: Request): string {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  const domain = env.COOKIE_DOMAIN ? `; Domain=${env.COOKIE_DOMAIN}` : "";
  return `${getCookieName(env)}=; Max-Age=0; Path=/${domain}; HttpOnly; SameSite=Lax${secure}`;
}

export async function loadUserAuthProfile(request: Request, env: Env): Promise<UserAuthProfile | null> {
  const bearerToken = readBearerToken(request);
  if (bearerToken) {
    return appSessionPayloadToUser(await verifyAppSessionToken(bearerToken, env, "access"));
  }

  const localActor = env.ENVIRONMENT === "production" ? null : normalizeEmailCandidate(request.headers.get(localActorHeader));
  if (localActor) {
    return {
      id: `local_${localActor}`,
      email: localActor,
      name: null,
      role: "admin",
      systemRole: "owner",
      permissions: ["file:read", "file:upload", "file:delete", "file:share", "file:admin", `service:${fileServiceKey}:access`],
      services: [fileServiceKey],
      serviceAllowed: true,
      serviceReason: "local_development_actor",
    };
  }

  const cookieHeader = request.headers.get("cookie") || "";
  if (!readCookie(cookieHeader, getCookieName(env))) return null;

  const origin = getUserAuthOrigin(env);
  const headers = buildUserCenterHeaders(request);
  const meResponse = await fetch(`${origin}/api/auth/me`, { headers });
  if (meResponse.status === 401 || meResponse.status === 403) return null;
  if (!meResponse.ok) {
    throw new HttpError("ChemVault User authentication is unavailable.", 502, "USER_AUTH_UNAVAILABLE");
  }

  const payload = (await meResponse.json()) as UserCenterMeResponse;
  const user = payload.user;
  const email = normalizeEmailCandidate(user?.email);
  const id = typeof user?.id === "string" && user.id.trim() ? user.id.trim() : "";
  if (!user || !email || !id) {
    throw new HttpError("ChemVault User returned an invalid profile.", 502, "USER_AUTH_INVALID_PROFILE");
  }

  const access = await fetchUserCenterServiceAccess(origin, headers);

  return {
    id,
    email,
    name: typeof user.name === "string" && user.name.trim() ? user.name.trim() : null,
    role: typeof user.role === "string" && user.role.trim() ? user.role.trim() : "free",
    systemRole: typeof user.systemRole === "string" && user.systemRole.trim() ? user.systemRole.trim() : "user",
    permissions: normalizeStringList(user.permissions),
    services: normalizeStringList(user.services),
    serviceAllowed: access.allowed,
    serviceReason: access.reason,
  };
}

export function requireUserAuthProfile(user: UserAuthProfile | null, request: Request, env: Env): UserAuthProfile {
  if (user) return user;
  throw new HttpError("Sign in through ChemVault User to access files.", 401, "AUTH_REQUIRED", {
    loginUrl: getUserLoginUrl(request, env),
  });
}

export function getDevelopmentActorEmail(request: Request, env: Pick<Env, "ENVIRONMENT">): string | null {
  if (env.ENVIRONMENT === "production") return null;
  return (
    normalizeEmailCandidate(request.headers.get(localActorHeader)) ??
    normalizeEmailCandidate(request.headers.get("Cf-Access-Authenticated-User-Email"))
  );
}

export function userFilePermissionLevel(user: UserAuthProfile): FilePermissionLevel {
  if (!userCanAccessFileService(user)) return "none";
  if (userCanManageFiles(user)) return "write";
  if (hasAnyPermission(user, ["file:upload", "file:delete", "file:share", "file:public_manage", "file:private_access"])) return "write";
  if (hasPermission(user, "file:read")) return "read";
  return "none";
}

export function userCanManageFiles(user: UserAuthProfile): boolean {
  return isPrivilegedSystemRole(user.systemRole) || hasPermission(user, "file:admin");
}

function userCanAccessFileService(user: UserAuthProfile): boolean {
  return (
    isPrivilegedSystemRole(user.systemRole) ||
    user.serviceAllowed ||
    user.services.includes(fileServiceKey) ||
    hasPermission(user, `service:${fileServiceKey}:access`)
  );
}

function isPrivilegedSystemRole(systemRole: string): boolean {
  return systemRole === "owner" || systemRole === "super_admin";
}

function hasAnyPermission(user: UserAuthProfile, permissions: string[]): boolean {
  return permissions.some((permission) => hasPermission(user, permission));
}

function hasPermission(user: UserAuthProfile, permission: string): boolean {
  return user.permissions.includes(permission);
}

async function fetchUserCenterServiceAccess(
  origin: string,
  headers: Headers
): Promise<{ allowed: boolean; reason: string | null }> {
  const url = new URL("/api/access/check", origin);
  url.searchParams.set("service", fileServiceKey);
  const response = await fetch(url, { headers });
  if (response.status === 401 || response.status === 403) {
    return { allowed: false, reason: "user_center_denied" };
  }
  if (!response.ok) {
    throw new HttpError("ChemVault User access check is unavailable.", 502, "USER_AUTH_UNAVAILABLE");
  }
  const payload = (await response.json()) as UserCenterAccessResponse;
  return {
    allowed: payload.allowed === true,
    reason: typeof payload.reason === "string" ? payload.reason : null,
  };
}

function buildUserCenterHeaders(request: Request): Headers {
  const headers = new Headers({
    accept: "application/json",
    cookie: request.headers.get("cookie") || "",
  });
  const userAgent = request.headers.get("user-agent");
  const cfIp = request.headers.get("cf-connecting-ip");
  if (userAgent) headers.set("user-agent", userAgent);
  if (cfIp) headers.set("cf-connecting-ip", cfIp);
  return headers;
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => (typeof entry === "string" ? entry.trim() : "")).filter(Boolean);
}
