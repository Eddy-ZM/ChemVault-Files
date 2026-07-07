import type { Env } from "../_lib/env";

const defaultAllowedOrigins = [
  "null",
  "app://chemvault-files",
  "http://127.0.0.1:5177",
  "http://localhost:5177",
];

export const onRequest: PagesFunction<Env> = async ({ request, env, next }) => {
  const origin = request.headers.get("origin");
  const corsHeaders = corsHeadersForOrigin(origin, env);

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  const downstream = await next();
  const response = new Response(downstream.body, downstream);
  for (const [key, value] of corsHeaders.entries()) {
    response.headers.set(key, value);
  }
  return response;
};

function corsHeadersForOrigin(origin: string | null, env: Env): Headers {
  const headers = new Headers({
    "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "access-control-allow-headers": "authorization,content-type,x-chemvault-user-email",
    "access-control-max-age": "86400",
    vary: "Origin",
  });
  if (origin && allowedOrigins(env).has(origin)) {
    headers.set("access-control-allow-origin", origin);
    headers.set("access-control-allow-credentials", "true");
  }
  return headers;
}

function allowedOrigins(env: Env): Set<string> {
  const configured = String(env.ALLOWED_APP_ORIGINS || "")
    .split(/[\s,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  return new Set([...defaultAllowedOrigins, ...configured]);
}
