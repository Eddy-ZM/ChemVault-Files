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

  it("resolves configurable internal capabilities and caps external users at read-only", () => {
    const roles = [
      mapRolePolicy({ ...baseRole, id: "role_super", name: "Super", scope: "owner", permission: "write" }),
      mapRolePolicy({ ...baseRole, id: "role_internal", name: "Common_In", scope: "domain", domain: "chemvault.science", permission: "none" }),
      mapRolePolicy({ ...baseRole, id: "role_external", name: "Common_Out", scope: "external", permission: "write" }),
    ];

    const owner = resolveActorAccessFromRoles("owner@chemvault.science", "owner@chemvault.science", roles);
    const internal = resolveActorAccessFromRoles("scientist@chemvault.science", "owner@chemvault.science", roles);
    const external = resolveActorAccessFromRoles("visitor@example.com", "owner@chemvault.science", roles);

    expect(owner).toMatchObject({ roleId: "role_super", permission: "write", canManageRoles: true });
    expect(internal).toMatchObject({ roleId: "role_internal", permission: "none", canManageRoles: false });
    expect(external).toMatchObject({ roleId: "role_external", permission: "read", canManageRoles: false });
    expect(canReadFiles(internal)).toBe(false);
    expect(canWriteFiles(internal)).toBe(false);
    expect(canReadFiles(external)).toBe(true);
    expect(canWriteFiles(external)).toBe(false);
  });

  it("treats a custom Super domain role as a role manager", () => {
    const roles = [
      mapRolePolicy({ ...baseRole, id: "role_super", name: "Super", scope: "owner", permission: "write" }),
      mapRolePolicy({ ...baseRole, id: "role_research_super", name: "Super", scope: "domain", domain: "chemvault.science", permission: "read" }),
      mapRolePolicy({ ...baseRole, id: "role_external", name: "Common_Out", scope: "external", permission: "read" }),
    ];

    const superUser = resolveActorAccessFromRoles("super@chemvault.science", "owner@chemvault.science", roles);

    expect(superUser).toMatchObject({ roleId: "role_research_super", permission: "write", canManageRoles: true });
  });

  it("treats configured admin emails as Super role managers", () => {
    const roles = [
      mapRolePolicy({ ...baseRole, id: "role_super", name: "Super", scope: "owner", permission: "write" }),
      mapRolePolicy({ ...baseRole, id: "role_internal", name: "Common_In", scope: "domain", domain: "chemvault.science", permission: "read" }),
      mapRolePolicy({ ...baseRole, id: "role_external", name: "Common_Out", scope: "external", permission: "read" }),
    ];

    const superUser = resolveActorAccessFromRoles(
      "ziwen@chemvault.science",
      "owner@chemvault.science",
      roles,
      "ziwen@chemvault.science, teammate@chemvault.science"
    );

    expect(superUser).toMatchObject({ roleId: "role_super", permission: "write", canManageRoles: true });
  });

  it("treats the ChemVault Super mailbox as a role manager without extra env wiring", () => {
    const roles = [
      mapRolePolicy({ ...baseRole, id: "role_super", name: "Super", scope: "owner", permission: "write" }),
      mapRolePolicy({ ...baseRole, id: "role_internal", name: "Common_In", scope: "domain", domain: "chemvault.science", permission: "read" }),
      mapRolePolicy({ ...baseRole, id: "role_external", name: "Common_Out", scope: "external", permission: "read" }),
    ];

    const superUser = resolveActorAccessFromRoles("ziwen.mu@chemvault.science", "owner@chemvault.science", roles);

    expect(superUser).toMatchObject({ roleId: "role_super", permission: "write", canManageRoles: true });
  });
});
