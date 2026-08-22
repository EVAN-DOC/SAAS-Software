const config = require("../config");

const store = new Map();
const inFlight = new Map();

function refresh(key, fn) {
  if (inFlight.has(key)) return inFlight.get(key);

  const promise = fn()
    .then((value) => {
      store.set(key, { value, at: Date.now() });
      inFlight.delete(key);
      return value;
    })
    .catch((err) => {
      inFlight.delete(key);
      throw err;
    });

  inFlight.set(key, promise);
  return promise;
}

/**
 * Stale-while-revalidate memoizer. Good enough for a single-instance
 * dashboard API; swap for Redis if this ever runs multi-instance.
 *
 * A full live fetch can take several minutes (hundreds of orders, each
 * needing its own Shopify/Cashfree lookups under Shopify's 2 req/s cap).
 * Once a value has been cached once, callers must never block on a slow
 * refetch again — once the TTL expires, the last good value is returned
 * immediately while a fresh one is fetched in the background. The first
 * call ever (nothing cached yet) still has to wait for real data — that's
 * what the startup warmup in index.js is for.
 */
async function cached(key, fn) {
  const hit = store.get(key);
  const now = Date.now();

  if (hit) {
    if (now - hit.at >= config.cacheTtlSeconds * 1000) {
      refresh(key, fn).catch((err) => console.error(`Background refresh of "${key}" failed:`, err.message));
    }
    return hit.value;
  }

  return refresh(key, fn);
}

function invalidate(key) {
  store.delete(key);
}

/** True once `key` has a cached value, however stale — lets callers tell "still warming up for the first time" apart from "actually failed". */
function isWarm(key) {
  return store.has(key);
}

module.exports = { cached, invalidate, isWarm };
