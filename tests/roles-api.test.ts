import { describe, expect, it } from "vitest";
import { onRequestGet as getRoles, onRequestPatch as patchRoles } from "../functions/api/roles";

class FakeStatement {
  private args: unknown[] = [];

  constructor(private readonly state: { permission: string }, private readonly sql: string) {}

  bind(...args: unknown[]): FakeStatement {
    this.args = args;
    return this;
  }

  async all(): Promise<{ results: Record<string, unknown>[] }> {
    if (this.sql.includes("FROM file_roles")) {
      return {
        results: [
          role("role_super", "Super", "owner", null, "write"),
          role("role_internal", "Common_In", "domain", "chemvault.science", this.state.permission),
          role("role_external", "Common_Out", "external", null, "read"),
        ],
      };
    }
    return { results: [] };
  }

  async run(): Promise<{ success: true }> {
    if (this.sql.includes("UPDATE file_roles") && this.args[2] === "role_internal") {
      this.state.permission = String(this.args[0]);
    }
    return { success: true };
  }
}

class FakeD1 {
  constructor(private readonly state: { permission: string }) {}

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

function context(state: { permission: string }, request: Request) {
  return {
    request,
    env: {
      FILES_DB: new FakeD1(state),
      PRIVATE_OWNER_EMAIL: "owner@chemvault.science",
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
  it("returns roles and the current actor access", async () => {
    const response = await getRoles(context({ permission: "read" }, request("scientist@chemvault.science")));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      roles: [{ id: "role_super" }, { id: "role_internal", permission: "read" }, { id: "role_external" }],
      actorAccess: { roleId: "role_internal", permission: "read", canManageRoles: false },
    });
  });

  it("allows only the owner to update role permission levels", async () => {
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
});
