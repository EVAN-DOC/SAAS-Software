const config = require("../config");

const store = new Map();

/**
 * Simple in-memory memoizer keyed by name. Good enough for a single-instance
 * dashboard API; swap for Redis if this ever runs multi-instance.
 */
async function cached(key, fn) {
  const hit = store.get(key);
  const now = Date.now();
  if (hit && now - hit.at < config.cacheTtlSeconds * 1000) {
    return hit.value;
  }
  const value = await fn();
  store.set(key, { value, at: now });
  return value;
}

function invalidate(key) {
  store.delete(key);
}

module.exports = { cached, invalidate };
