import { describe, expect, it } from "vitest";
import { onRequestGet as getRoles, onRequestPatch as patchRoles } from "../functions/api/roles";

interface RoleState {
  permission: string;
  internalRoleId?: string;
  internalRoleName?: string;
  extraRoles?: ReturnType<typeof role>[];
}

class FakeStatement {
  private args: unknown[] = [];

  constructor(private readonly state: RoleState, private readonly sql: string) {}

  bind(...args: unknown[]): FakeStatement {
    this.args = args;
    return this;
  }

  async all(): Promise<{ results: Record<string, unknown>[] }> {
    if (this.sql.includes("FROM file_roles")) {
      return {
        results: [
          role("role_super", "Super", "owner", null, "write"),
          role(this.state.internalRoleId ?? "role_internal", this.state.internalRoleName ?? "Common_In", "domain", "chemvault.science", this.state.permission),
          ...(this.state.extraRoles ?? []),
          role("role_external", "Common_Out", "external", null, "read"),
        ],
      };
    }
    return { results: [] };
  }

  async run(): Promise<{ success: true }> {
    if (this.sql.includes("UPDATE file_roles") && this.args[2] === (this.state.internalRoleId ?? "role_internal")) {
      this.state.permission = String(this.args[0]);
    }
    return { success: true };
  }
}

class FakeD1 {
  constructor(private readonly state: RoleState) {}

  prepare(sql: string): FakeStatement {
    return new FakeStatement(this.state, sql);
  }
}

function role(id: string, name: string, scope: string, domain: string | null, permission: string) {
  return {
    id,
    name,
    description: null,
    scope,
    domain,
    permission,
    is_default: id === "role_external" ? 1 : 0,
    created_at: "2026-06-18T00:00:00.000Z",
    updated_at: "2026-06-18T00:00:00.000Z",
  };
}

function context(state: RoleState, request: Request, envOverrides: Record<string, unknown> = {}) {
  return {
    request,
    env: {
      FILES_DB: new FakeD1(state),
      PRIVATE_OWNER_EMAIL: "owner@chemvault.science",
      ...envOverrides,
    },
  } as unknown as Parameters<typeof getRoles>[0];
}

function request(email: string, init?: RequestInit): Request {
  return new Request("https://file.chemvault.science/api/roles", {
    ...init,
    headers: {
      "Cf-Access-Authenticated-User-Email": email,
      ...(init?.headers ?? {}),
    },
  });
}

describe("roles API", () => {
  it("returns only the current role to non-admin actors", async () => {
    const response = await getRoles(context({ permission: "read" }, request("scientist@chemvault.science")));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      roles: [{ id: "role_internal", permission: "read" }],
      actorAccess: { roleId: "role_internal", permission: "read", canManageRoles: false },
    });
  });

  it("returns every role to the owner administrator", async () => {
    const response = await getRoles(context({ permission: "read" }, request("owner@chemvault.science")));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      roles: [{ id: "role_super" }, { id: "role_internal", permission: "read" }, { id: "role_external" }],
      actorAccess: { roleId: "role_super", permission: "write", canManageRoles: true },
    });
  });

  it("returns every role to a custom Super role administrator", async () => {
    const response = await getRoles(
      context({ permission: "read", internalRoleId: "role_research_super", internalRoleName: "Super" }, request("scientist@chemvault.science"))
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      roles: [{ id: "role_super" }, { id: "role_research_super", permission: "read" }, { id: "role_external" }],
      actorAccess: { roleId: "role_research_super", permission: "write", canManageRoles: true },
    });
  });

  it("returns every role to a custom Super role even when Common_In is listed first", async () => {
    const response = await getRoles(
      context(
        {
          permission: "read",
          extraRoles: [role("role_research_super", "Super", "domain", "chemvault.science", "read")],
        },
        request("research-super@chemvault.science")
      )
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      roles: [{ id: "role_super" }, { id: "role_internal", permission: "read" }, { id: "role_research_super", permission: "read" }, { id: "role_external" }],
      actorAccess: { roleId: "role_research_super", permission: "write", canManageRoles: true },
    });
  });

  it("returns every role to a configured admin email", async () => {
    const response = await getRoles(
      context({ permission: "read" }, request("ziwen@chemvault.science"), { FILES_ADMIN_EMAILS: "ziwen@chemvault.science" })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      roles: [{ id: "role_super" }, { id: "role_internal", permission: "read" }, { id: "role_external" }],
      actorAccess: { roleId: "role_super", permission: "write", canManageRoles: true },
    });
  });

  it("returns every role to the ChemVault Super mailbox", async () => {
    const response = await getRoles(context({ permission: "read" }, request("ziwen.mu@chemvault.science")));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      roles: [{ id: "role_super" }, { id: "role_internal", permission: "read" }, { id: "role_external" }],
      actorAccess: { roleId: "role_super", permission: "write", canManageRoles: true },
    });
  });

  it("blocks non-manager actors and allows owner updates", async () => {
    const state = { permission: "read" };
    const denied = await patchRoles(
      context(
        state,
        request("scientist@chemvault.science", { method: "PATCH", body: JSON.stringify({ roles: [{ id: "role_internal", permission: "write" }] }) })
      ) as unknown as Parameters<typeof patchRoles>[0]
    );
    expect(denied.status).toBe(403);

    const updated = await patchRoles(
      context(
        state,
        request("owner@chemvault.science", { method: "PATCH", body: JSON.stringify({ roles: [{ id: "role_internal", permission: "write" }] }) })
      ) as unknown as Parameters<typeof patchRoles>[0]
    );

    expect(updated.status).toBe(200);
    expect(state.permission).toBe("write");
  });

  it("allows a custom Super role administrator to update role permission levels", async () => {
    const state = { permission: "read", internalRoleId: "role_research_super", internalRoleName: "Super" };
    const updated = await patchRoles(
      context(
        state,
        request("scientist@chemvault.science", {
          method: "PATCH",
          body: JSON.stringify({ roles: [{ id: "role_research_super", permission: "write" }] }),
        })
      ) as unknown as Parameters<typeof patchRoles>[0]
    );

    expect(updated.status).toBe(200);
    expect(state.permission).toBe("write");
  });
});
