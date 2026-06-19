import type { ActorAccess, FilePermissionLevel, FileRecord, FileRolePolicy, FileRoleScope } from "../../src/lib/chemvault-files/types";
import type { Env } from "./env";
import { getActorEmail } from "./env";
import { errorJson } from "./http";

const PERMISSION_LEVELS = new Set<FilePermissionLevel>(["none", "read", "write"]);
const ROLE_SCOPES = new Set<FileRoleScope>(["owner", "domain", "external"]);

export function mapRolePolicy(row: Record<string, unknown>): FileRolePolicy {
  const permission = String(row.permission || "read") as FilePermissionLevel;
  const scope = String(row.scope || "external") as FileRoleScope;
  return {
    id: String(row.id),
    name: String(row.name),
    description: row.description === null ? null : String(row.description ?? ""),
    scope: ROLE_SCOPES.has(scope) ? scope : "external",
    domain: row.domain === null || row.domain === undefined ? null : String(row.domain).trim().toLowerCase(),
    permission: PERMISSION_LEVELS.has(permission) ? permission : "read",
    isDefault: Number(row.is_default ?? row.isDefault ?? 0) === 1,
    createdAt: String(row.created_at ?? row.createdAt ?? new Date(0).toISOString()),
    updatedAt: String(row.updated_at ?? row.updatedAt ?? new Date(0).toISOString()),
  };
}

export async function listRolePolicies(db: D1Database, env: Env): Promise<FileRolePolicy[]> {
  try {
    const rows = await db.prepare("SELECT * FROM file_roles ORDER BY sort_order, name").all();
    const policies = (rows.results as Record<string, unknown>[]).map(mapRolePolicy);
    return policies.length ? policies : defaultRolePolicies(env);
  } catch (error) {
    if (error instanceof Error && error.message.includes("no such table: file_roles")) return defaultRolePolicies(env);
    throw error;
  }
}

export function resolveActorAccessFromRoles(
  actorEmail: string,
  ownerEmail: string | undefined,
  roles: FileRolePolicy[],
  adminEmails?: string
): ActorAccess {
  const normalizedActor = normalizeEmail(actorEmail);
  const ownerEmails = parseEmailList(ownerEmail || "owner@chemvault.science");
  const normalizedOwner = ownerEmails[0] ?? "owner@chemvault.science";
  const actorDomain = normalizedActor.split("@")[1] || "";
  const adminEmailSet = new Set([...ownerEmails, ...parseEmailList(adminEmails)]);

  if (adminEmailSet.has(normalizedActor)) {
    const ownerRole =
      roles.find((role) => role.scope === "owner") ??
      roles.find((role) => roleCanManageRoles(role)) ??
      defaultRolePolicies({ PRIVATE_OWNER_EMAIL: normalizedOwner })[0];
    return {
      actorEmail,
      roleId: ownerRole.id,
      roleName: ownerRole.name,
      permission: "write",
      canManageRoles: true,
    };
  }

  const domainRole = roles.find((role) => role.scope === "domain" && role.domain === actorDomain);
  if (domainRole) {
    const canManageRoles = roleCanManageRoles(domainRole);
    return {
      actorEmail,
      roleId: domainRole.id,
      roleName: domainRole.name,
      permission: canManageRoles ? "write" : domainRole.permission,
      canManageRoles,
    };
  }

  const externalRole = roles.find((role) => role.scope === "external") ?? roles.find((role) => role.isDefault);
  const role = externalRole ?? defaultRolePolicies({ PRIVATE_OWNER_EMAIL: normalizedOwner })[2];
  const permission = role.permission === "write" ? "read" : role.permission;
  return {
    actorEmail,
    roleId: role.id,
    roleName: role.name,
    permission,
    canManageRoles: false,
  };
}

export async function resolveActorAccess(request: Request, env: Env, db: D1Database): Promise<ActorAccess> {
  const actorEmail = getActorEmail(request, env);
  return resolveActorAccessFromRoles(actorEmail, env.PRIVATE_OWNER_EMAIL, await listRolePolicies(db, env), env.FILES_ADMIN_EMAILS);
}

export function canReadFiles(access: Pick<ActorAccess, "permission">): boolean {
  return access.permission === "read" || access.permission === "write";
}

export function canWriteFiles(access: Pick<ActorAccess, "permission">): boolean {
  return access.permission === "write";
}

export function canViewFile(access: ActorAccess, file: Pick<FileRecord, "visibility" | "roleIds">): boolean {
  if (access.canManageRoles) return true;
  if (!canReadFiles(access)) return false;
  if (file.visibility === "public") return true;
  return file.roleIds.includes(access.roleId);
}

export function permissionDeniedJson(access: Pick<ActorAccess, "roleName" | "permission">, required: "read" | "write"): Response {
  return errorJson(`${access.roleName} role has ${access.permission} access; ${required} access is required.`, 403, "FILES_PERMISSION_DENIED");
}

export function defaultRolePolicies(env: Pick<Env, "PRIVATE_OWNER_EMAIL">): FileRolePolicy[] {
  const timestamp = "2026-06-18T00:00:00.000Z";
  const ownerDomain = normalizeEmail(env.PRIVATE_OWNER_EMAIL || "owner@chemvault.science").split("@")[1] || "chemvault.science";
  return [
    rolePolicy("role_super", "Super", "Owner role with full file access.", "owner", null, "write", false, timestamp),
    rolePolicy("role_internal", "Common_In", "Cloudflare Access users from the ChemVault domain.", "domain", ownerDomain, "write", false, timestamp),
    rolePolicy("role_external", "Common_Out", "External Cloudflare Access users.", "external", null, "read", true, timestamp),
  ];
}

function rolePolicy(
  id: string,
  name: string,
  description: string,
  scope: FileRoleScope,
  domain: string | null,
  permission: FilePermissionLevel,
  isDefault: boolean,
  timestamp: string
): FileRolePolicy {
  return {
    id,
    name,
    description,
    scope,
    domain,
    permission,
    isDefault,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function roleCanManageRoles(role: FileRolePolicy): boolean {
  const normalizedId = role.id.trim().toLowerCase();
  const normalizedName = role.name.trim().toLowerCase();
  return role.scope === "owner" || normalizedId === "role_super" || normalizedName === "super";
}

function parseEmailList(value: string | undefined): string[] {
  return String(value || "")
    .split(/[\s,;]+/)
    .map((email) => normalizeEmail(email))
    .filter((email) => email.includes("@"));
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}
