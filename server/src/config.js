require("dotenv").config();

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
    // shopifyService.js's setIcarryReferenceMetafields(). Adding it to an
    // already-installed app requires re-visiting /auth/shopify to re-consent;
    // the existing stored token keeps its old (narrower) scopes until then.
    scopes: process.env.SHOPIFY_SCOPES || "read_orders,read_customers,read_fulfillments,write_orders",
    redirectUri: process.env.SHOPIFY_REDIRECT_URI || `http://localhost:${process.env.PORT || 4000}/auth/shopify/callback`,
    // Unset (default) = pull the store's entire order history. Set this once
    // your order count grows large enough that every dashboard load re-fetching
    // everything gets slow.
    orderLookbackDays: process.env.SHOPIFY_ORDER_LOOKBACK_DAYS
      ? Number(process.env.SHOPIFY_ORDER_LOOKBACK_DAYS)
      : undefined,
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
