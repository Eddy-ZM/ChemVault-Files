import type { Env } from "../../../_lib/env";
import { authorizeLifecycleRequest, deleteFilesUserData, exportFilesUserData, normalizeLifecycleEmail } from "../../../_lib/lifecycle";
import { ensureDriveAppSchema } from "../../../_lib/schema";

interface LifecycleBody {
  action?: "export" | "delete";
  email?: string;
  requestId?: string;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, params, env }) => {
  const unauthorized = await authorizeLifecycleRequest(request, env);
  if (unauthorized) return unauthorized;
  const db = env.FILES_DB;
  if (!db) return Response.json({ error: "Files database is not configured." }, { status: 503 });

  const userId = String(params.userId || "").trim();
  const body = await request.json<LifecycleBody>().catch(() => null);
  const email = normalizeLifecycleEmail(body?.email);
  if (!userId || !email) return Response.json({ error: "User id and valid email are required." }, { status: 400 });
  if (!body || (body.action !== "export" && body.action !== "delete")) {
    return Response.json({ error: "Lifecycle action must be export or delete." }, { status: 400 });
  }

  await ensureDriveAppSchema(db);
  if (body.action === "export") {
    const data = await exportFilesUserData(db, email);
    return Response.json({ ok: true, service: "files", userId, requestId: body.requestId || null, data });
  }

  const deleted = await deleteFilesUserData(env, db, email);
  return Response.json({ ok: true, service: "files", userId, requestId: body.requestId || null, deleted });
};
