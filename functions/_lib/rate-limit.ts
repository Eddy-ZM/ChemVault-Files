interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimitOptions {
  key: string;
  limit: number;
  windowMs: number;
  now?: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

export function checkInMemoryRateLimit(options: RateLimitOptions): Response | null {
  const now = options.now ?? Date.now();
  const current = rateLimitStore.get(options.key);

  if (!current || current.resetAt <= now) {
    rateLimitStore.set(options.key, { count: 1, resetAt: now + options.windowMs });
    return null;
  }

  if (current.count >= options.limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
    return new Response(JSON.stringify({ error: "Too many requests. Please try again later." }), {
      status: 429,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "retry-after": String(retryAfterSeconds),
      },
    });
  }

  current.count += 1;
  rateLimitStore.set(options.key, current);
  return null;
}

export function rateLimitClientId(request: Request, actorEmail?: string | null): string {
  const email = actorEmail?.trim().toLowerCase();
  if (email) return `user:${email}`;
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "anonymous"
  );
}
