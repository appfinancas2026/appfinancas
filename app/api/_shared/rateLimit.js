// Sliding-window in-memory rate limiter keyed by userId.
// Survives within a single serverless function instance; not shared across
// instances — acceptable for abuse prevention, not for strict enforcement.
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 20;

const store = new Map();

export function checkRateLimit(userId) {
  const now = Date.now();
  const recent = (store.get(userId) || []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_REQUESTS) return false;
  recent.push(now);
  store.set(userId, recent);
  return true;
}
