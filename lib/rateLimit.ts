/**
 * Best-effort per-IP throttle.
 *
 * This lives in process memory, so on serverless it only sees the requests that
 * land on the same warm instance. It blunts casual bursts; the durable spend
 * ceiling is the daily cap in the route handler, which counts stored objects.
 */
const hits = new Map<string, number[]>();

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = Number(process.env.DIT_RATE_LIMIT_PER_MINUTE ?? 3);

export function checkRateLimit(ip: string): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((at) => now - at < WINDOW_MS);

  if (recent.length >= MAX_PER_WINDOW) {
    const retryAfter = Math.ceil((WINDOW_MS - (now - recent[0])) / 1000);
    hits.set(ip, recent);
    return { ok: false, retryAfter };
  }

  recent.push(now);
  hits.set(ip, recent);

  // Keep the map from growing without bound on a long-lived instance.
  if (hits.size > 5_000) {
    for (const [key, times] of hits) {
      if (times.every((at) => now - at >= WINDOW_MS)) hits.delete(key);
    }
  }

  return { ok: true, retryAfter: 0 };
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}
