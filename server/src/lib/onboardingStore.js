const fs = require("fs");
const path = require("path");

const FILE = path.join(__dirname, "..", "..", ".data", "onboarded_at.json");

/**
 * Records the one real moment this app first connected to the store — used
 * as the default order-sync cutoff (config.js's ordersSinceDate) so a fresh
 * install only ever starts serving data from "today" forward, automatically,
 * without anyone having to hand-edit SHOPIFY_ORDERS_SINCE_DATE. Deliberately
 * write-once: re-running the OAuth flow later (re-consenting for a new
 * scope, like this app has done several times) must NOT push the cutoff
 * forward again and silently cut off everything synced since the real
 * first install.
 *
 * Carries the same caveat as tokenStore.js's file: it lives on local disk,
 * so a host with no persistent filesystem (e.g. Render's free tier wiping
 * state on a cold restart) can lose it and re-record a later date on the
 * next re-auth. Once a value here is confirmed correct, copying it into a
 * real SHOPIFY_ORDERS_SINCE_DATE env var (which always takes priority — see
 * config.js) makes it permanent the same way SHOPIFY_ACCESS_TOKEN was made
 * permanent for the token itself.
 */
function getOnboardedAt() {
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf8")).onboardedAt || null;
  } catch {
    return null;
  }
}

/** No-ops if already recorded — first install wins, every later re-auth leaves it untouched. */
function recordOnboardedAtIfUnset() {
  if (getOnboardedAt()) return;
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify({ onboardedAt: new Date().toISOString() }, null, 2));
}

module.exports = { getOnboardedAt, recordOnboardedAtIfUnset };
