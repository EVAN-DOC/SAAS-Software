const fs = require("fs");
const path = require("path");
const config = require("../config");

const store = new Map();
const inFlight = new Map();
const diskChecked = new Set();

// Reuses the .data/ dir's existing gitignore rule (`.data/*.json`) — see
// icarry_shipment_map.json / shopify_token.json for the same pattern.
const DISK_DIR = path.join(__dirname, "..", "..", ".data");

function diskPath(key) {
  return path.join(DISK_DIR, `cache_${key}.json`);
}

/** Reads a persisted entry once per key per process; absent/corrupt file is just a miss, not an error. */
function loadFromDisk(key) {
  diskChecked.add(key);
  try {
    const entry = JSON.parse(fs.readFileSync(diskPath(key), "utf8"));
    store.set(key, entry);
    return entry;
  } catch {
    return null;
  }
}

function saveToDisk(key, entry) {
  try {
    fs.mkdirSync(DISK_DIR, { recursive: true });
    fs.writeFileSync(diskPath(key), JSON.stringify(entry));
  } catch (err) {
    console.error(`[cache] Couldn't persist "${key}" to disk:`, err.message);
  }
}

function refresh(key, fn) {
  if (inFlight.has(key)) return inFlight.get(key);

  const promise = fn()
    .then((value) => {
      const entry = { value, at: Date.now() };
      store.set(key, entry);
      inFlight.delete(key);
      saveToDisk(key, entry);
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
 * immediately while a fresh one is fetched in the background.
 *
 * The in-memory store is empty on every process restart, which used to mean
 * every restart re-paid that multi-minute cost before anyone could see data.
 * A disk-backed fallback (checked once per key per process) closes that gap:
 * whatever was last successfully synced survives a restart, so a cold
 * process can serve last-known-good data immediately and refresh it in the
 * background instead of blocking the first visitor after every boot. This
 * only helps when the filesystem itself survives the restart — a host with
 * no persistent disk (e.g. a free-tier container that's gone fully to sleep
 * and spun back up fresh) still pays the full cost once per real cold start.
 */
async function cached(key, fn) {
  let hit = store.get(key);
  if (!hit && !diskChecked.has(key)) {
    hit = loadFromDisk(key);
  }
  const now = Date.now();

  if (hit) {
    if (now - hit.at >= config.cacheTtlSeconds * 1000) {
      refresh(key, fn).catch((err) => console.error(`Background refresh of "${key}" failed:`, err.message));
    }
    return hit.value;
  }

  return refresh(key, fn);
}

// Marks the entry stale instead of deleting it outright. Deleting it used to
// mean every booking/label/cancel action (and now every Shopify order
// webhook) would wipe the in-memory value entirely — and since diskChecked
// only ever consults disk once per key per process lifetime, nothing could
// repopulate it afterwards. The visible symptom: isWarm() started reporting
// "cold" right after any of those actions, which is what made the
// "Syncing your store…" screen reappear on the Orders page after cancelling
// a shipment, and cached() fell into a fully blocking resync instead of the
// stale-while-revalidate background refresh this module's own doc comment
// promises. Setting `at` to 0 keeps the last-known-good value available
// (so isWarm() and cached()'s synchronous return both still work) while
// still forcing the very next cached() call to kick off a fresh refresh.
function invalidate(key) {
  const hit = store.get(key);
  if (hit) hit.at = 0;
}

/** True once `key` has a cached value (memory or disk), however stale — lets callers tell "still warming up for the first time" apart from "actually failed". */
function isWarm(key) {
  if (store.has(key)) return true;
  if (!diskChecked.has(key)) return Boolean(loadFromDisk(key));
  return false;
}

module.exports = { cached, invalidate, isWarm };
