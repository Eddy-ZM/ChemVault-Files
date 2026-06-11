export function okJson(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...init.headers,
    },
  });
}

export function errorJson(message: string, status = 400, code = "BAD_REQUEST"): Response {
  return okJson({ error: { code, message } }, { status });
}

export async function parseJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new Error("Request body must be valid JSON");
  }
}

export function routeError(error: unknown): Response {
  const message = error instanceof Error ? error.message : "Unexpected server error";
  const status = message.includes("not configured") ? 503 : 400;
  const code = status === 503 ? "CONFIGURATION_MISSING" : "BAD_REQUEST";
  return errorJson(message, status, code);
}
