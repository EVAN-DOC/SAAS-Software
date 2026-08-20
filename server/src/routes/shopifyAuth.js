const express = require("express");
const crypto = require("crypto");
const axios = require("axios");
const config = require("../config");
const tokenStore = require("../lib/tokenStore");
const { invalidate } = require("../lib/cache");

const router = express.Router();

// Single-user local dev tool — an in-memory state value is enough CSRF
// protection here (no concurrent installs, no multi-tenant sessions).
let pendingState = null;

function requireOAuthConfig(res) {
  const { shopDomain, clientId, clientSecret } = config.shopify;
  if (!shopDomain || !clientId || !clientSecret) {
    res
      .status(500)
      .send("Set SHOPIFY_SHOP_DOMAIN, SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET in server/.env first.");
    return false;
  }
  return true;
}

// Visit this in a browser to kick off installation on your store.
router.get("/shopify", (req, res) => {
  if (!requireOAuthConfig(res)) return;
  const { shopDomain, clientId, scopes, redirectUri } = config.shopify;

  pendingState = crypto.randomBytes(16).toString("hex");
  const url = new URL(`https://${shopDomain}/admin/oauth/authorize`);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("scope", scopes);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", pendingState);

  res.redirect(url.toString());
});

// Shopify redirects here after the merchant approves installation.
router.get("/shopify/callback", async (req, res) => {
  if (!requireOAuthConfig(res)) return;
  const { shop, code, state, hmac } = req.query;
  const { shopDomain, clientId, clientSecret } = config.shopify;

  if (!code || !shop) return res.status(400).send("Missing code/shop in callback.");
  if (shop !== shopDomain) return res.status(400).send(`Unexpected shop "${shop}", expected "${shopDomain}".`);
  if (!pendingState || state !== pendingState) return res.status(400).send("Invalid state — restart at /auth/shopify.");
  pendingState = null;

  // Verify the HMAC Shopify signs the callback with, per their OAuth docs.
  const { hmac: _drop, signature: _drop2, ...rest } = req.query;
  const message = Object.keys(rest)
    .sort()
    .map((k) => `${k}=${Array.isArray(rest[k]) ? rest[k].join(",") : rest[k]}`)
    .join("&");
  const digest = crypto.createHmac("sha256", clientSecret).update(message).digest("hex");
  if (digest !== hmac) return res.status(400).send("HMAC verification failed — request may not be from Shopify.");

  try {
    const tokenRes = await axios.post(`https://${shopDomain}/admin/oauth/access_token`, {
      client_id: clientId,
      client_secret: clientSecret,
      code,
    });
    tokenStore.writeToken(tokenRes.data.access_token);
    invalidate("dashboard");
    res.send(
      `<h2>Shopify connected ✓</h2><p>Scopes granted: ${tokenRes.data.scope}</p><p>You can close this tab and reload the dashboard.</p>`
    );
  } catch (err) {
    res.status(500).send(`Token exchange failed: ${err.response?.data ? JSON.stringify(err.response.data) : err.message}`);
  }
});

router.get("/shopify/status", (req, res) => {
  res.json({ connected: Boolean(tokenStore.readToken() || config.shopify.accessToken) });
});

module.exports = router;
