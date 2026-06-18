import { describe, expect, it } from "vitest";
import { canReadFiles, canWriteFiles, mapRolePolicy, resolveActorAccessFromRoles } from "../functions/_lib/permissions";

const baseRole = {
  id: "role_external",
  name: "Common_Out",
  description: "External Access users",
  scope: "external",
  domain: null,
  permission: "none",
  is_default: 1,
  created_at: "2026-06-18T00:00:00.000Z",
  updated_at: "2026-06-18T00:00:00.000Z",
};

describe("file role permissions", () => {
  it("maps role records to separate permission levels", () => {
    expect(mapRolePolicy({ ...baseRole, permission: "none" })).toMatchObject({ permission: "none" });
    expect(mapRolePolicy({ ...baseRole, permission: "read" })).toMatchObject({ permission: "read" });
    expect(mapRolePolicy({ ...baseRole, permission: "write" })).toMatchObject({ permission: "write" });
  });

  it("resolves owner, domain, and external access roles", () => {
    const roles = [
      mapRolePolicy({ ...baseRole, id: "role_super", name: "Super", scope: "owner", permission: "write" }),
      mapRolePolicy({ ...baseRole, id: "role_internal", name: "Common_In", scope: "domain", domain: "chemvault.science", permission: "read" }),
      mapRolePolicy({ ...baseRole, id: "role_external", name: "Common_Out", scope: "external", permission: "none" }),
    ];

    const owner = resolveActorAccessFromRoles("owner@chemvault.science", "owner@chemvault.science", roles);
    const internal = resolveActorAccessFromRoles("scientist@chemvault.science", "owner@chemvault.science", roles);
    const external = resolveActorAccessFromRoles("visitor@example.com", "owner@chemvault.science", roles);

    expect(owner).toMatchObject({ roleId: "role_super", permission: "write", canManageRoles: true });
    expect(internal).toMatchObject({ roleId: "role_internal", permission: "read", canManageRoles: false });
    expect(external).toMatchObject({ roleId: "role_external", permission: "none", canManageRoles: false });
    expect(canReadFiles(internal)).toBe(true);
    expect(canWriteFiles(internal)).toBe(false);
    expect(canReadFiles(external)).toBe(false);
  });
});
