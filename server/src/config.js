require("dotenv").config();
const onboardingStore = require("./lib/onboardingStore");

function bool(v, fallback) {
  if (v === undefined) return fallback;
  return v === "true" || v === "1";
}

module.exports = {
  port: process.env.PORT || 4000,
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:3000",
  mockMode: bool(process.env.MOCK_MODE, true),
  cacheTtlSeconds: Number(process.env.CACHE_TTL_SECONDS || 60),

  shopify: {
    shopDomain: process.env.SHOPIFY_SHOP_DOMAIN,
    // Static token path (legacy "custom app" flow, if your store still offers it).
    accessToken: process.env.SHOPIFY_ACCESS_TOKEN,
    apiVersion: process.env.SHOPIFY_API_VERSION || "2024-10",
    // OAuth path (today's "Dev Dashboard" apps only hand out a Client ID/Secret —
    // an access token is obtained by installing the app on the store, see
    // src/routes/shopifyAuth.js). Once installed, the token is cached in
    // .data/shopify_token.json and this app never needs the flow again unless
    // the app is uninstalled/reinstalled.
    clientId: process.env.SHOPIFY_CLIENT_ID,
    clientSecret: process.env.SHOPIFY_CLIENT_SECRET,
    // write_orders is required to push iCarry shipment references (shipment_id,
    // awb, courier, tracking url) onto the order as metafields — see
    // shopifyService.js's setIcarryReferenceMetafields(). Actually fulfilling an
    // order with real tracking info (fulfillOrderWithTracking(), via the
    // FulfillmentOrder-based API) needs write_merchant_managed_fulfillment_orders
    // specifically — confirmed live: plain write_fulfillments alone gets a 403
    // "api_client does not have the required permission(s)" on that endpoint,
    // even though it's enough for the legacy direct-fulfillment endpoint. Adding
    // any of these to an already-installed app requires re-visiting /auth/shopify
    // to re-consent (and, since this app uses Shopify's config-managed scope flow
    // — see one-screen-dashboard/shopify.app.toml's use_legacy_install_flow —
    // that TOML's own `scopes` list has to be updated and deployed too, or
    // Shopify won't actually grant the new scope no matter what's requested
    // here); the existing stored token keeps its old (narrower) scopes until then.
    scopes:
      process.env.SHOPIFY_SCOPES ||
      "read_orders,read_customers,read_fulfillments,write_orders,write_fulfillments,read_merchant_managed_fulfillment_orders,write_merchant_managed_fulfillment_orders",
    redirectUri: process.env.SHOPIFY_REDIRECT_URI || `http://localhost:${process.env.PORT || 4000}/auth/shopify/callback`,
    // Unset (default) = pull the store's entire order history. Set this once
    // your order count grows large enough that every dashboard load re-fetching
    // everything gets slow.
    orderLookbackDays: process.env.SHOPIFY_ORDER_LOOKBACK_DAYS
      ? Number(process.env.SHOPIFY_ORDER_LOOKBACK_DAYS)
      : undefined,
    // A fixed calendar date/time (ISO 8601, e.g. "2026-09-07") — orders
    // created before this are never synced, permanently, no matter how much
    // time passes. This is the "service starts from when the client onboarded"
    // cutoff, distinct from orderLookbackDays (which is a rolling window that
    // keeps sliding forward). Takes priority over orderLookbackDays when set.
    // Falls back to the date this app's OAuth install actually first
    // completed (recorded automatically — see lib/onboardingStore.js) when
    // this isn't set explicitly, so a fresh install just works without
    // anyone having to hand-calculate and type in today's date. Set this
    // env var explicitly to override that auto-recorded value, or to make
    // it durable on a host (like Render's free tier) whose local disk
    // doesn't survive a redeploy — same reasoning as SHOPIFY_ACCESS_TOKEN.
    ordersSinceDate: process.env.SHOPIFY_ORDERS_SINCE_DATE || onboardingStore.getOnboardedAt() || undefined,
  },

  cashfree: {
    env: process.env.CASHFREE_ENV || "sandbox",
    clientId: process.env.CASHFREE_CLIENT_ID,
    clientSecret: process.env.CASHFREE_CLIENT_SECRET,
    apiVersion: process.env.CASHFREE_API_VERSION || "2023-08-01",
  },

  icarry: {
    // Base URL is fixed (https://www.icarry.in, hardcoded in icarryService.js)
    // per iCarry's official API Document v17.0 — no longer a guess needing
    // to be configurable.
    username: process.env.ICARRY_API_USERNAME,
    apiKey: process.env.ICARRY_API_KEY,
    // Required to actually book a shipment (a real, money-spending action) —
    // find yours in iCarry's panel under My Account > My Addresses > Pick up
    // address. Left unset on purpose by default; booking is refused with a
    // clear error until you deliberately set this.
    pickupAddressId: process.env.ICARRY_PICKUP_ADDRESS_ID,
    // Required for courier-cost estimates too (iCarry's estimate API needs
    // an origin pincode) — the pincode of that same pickup address.
    originPincode: process.env.ICARRY_ORIGIN_PINCODE,
  },
};
