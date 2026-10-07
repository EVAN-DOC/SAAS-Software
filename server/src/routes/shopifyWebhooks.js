const express = require("express");
const crypto = require("crypto");
const config = require("../config");
const { invalidate } = require("../lib/cache");
const { getDashboard } = require("../aggregator/buildDashboard");
const { getShippingList } = require("../aggregator/buildShipping");

const router = express.Router();

/** Shopify signs the raw webhook body with the app's client secret (HMAC-SHA256, base64) — see app.js's express.json({verify}) for where rawBody comes from. */
function verifyHmac(req) {
  if (!config.shopify.clientSecret || !req.rawBody) return false;
  const digest = crypto.createHmac("sha256", config.shopify.clientSecret).update(req.rawBody).digest("base64");
  const header = req.get("X-Shopify-Hmac-Sha256") || "";
  try {
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(header));
  } catch {
    return false; // different lengths etc. — definitely not a match
  }
}

/**
 * orders/create, orders/updated and orders/cancelled all land here (one
 * endpoint, multiple topics — see shopify.app.toml's [[webhooks.subscriptions]]).
 *
 * Before this existed, the dashboard had no way to learn about a new or
 * changed order except waiting for its own cache to naturally go stale (see
 * lib/cache.js's CACHE_TTL_SECONDS, default 60s) — and even then, that only
 * *starts* a refresh on the next incoming request, lazily. That's the actual
 * cause of a brand-new order not showing up for a minute or more. Responding
 * to Shopify immediately and refreshing in the background (not awaited here)
 * fixes that: by the time anyone's next request comes in, the cache is
 * already warm, instead of starting a fresh multi-call fetch synchronously.
 */
router.post("/orders", (req, res) => {
  if (!verifyHmac(req)) return res.status(401).send("Invalid HMAC");
  res.status(200).send("ok");

  invalidate("enriched");
  invalidate("dashboard");
  invalidate("shipping");
  // getEnrichedOrders() is shared underneath both — lib/cache.js's in-flight
  // dedup means calling both here only triggers one real "enriched" refetch.
  getDashboard().catch((err) => console.error("[shopify webhook] dashboard refresh failed:", err.message));
  getShippingList().catch((err) => console.error("[shopify webhook] shipping refresh failed:", err.message));
});

module.exports = router;
