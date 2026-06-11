export interface Env {
  FILES_DB?: D1Database;
  FILES_BUCKET?: R2Bucket;
  PRIVATE_OWNER_EMAIL?: string;
  ENVIRONMENT?: string;
}

export function getActorEmail(request: Request, env: Env): string {
  const accessEmail = request.headers.get("Cf-Access-Authenticated-User-Email");
  return accessEmail || env.PRIVATE_OWNER_EMAIL || "owner@chemvault.science";
}

export function hasRequiredBindings(env: Env): { d1: boolean; r2: boolean } {
  return {
    d1: Boolean(env.FILES_DB),
    r2: Boolean(env.FILES_BUCKET),
  };
}
