const axios = require("axios");
const config = require("../config");
const tokenStore = require("../lib/tokenStore");

function client() {
  const { shopDomain, apiVersion } = config.shopify;
  // Prefer a static token (legacy custom-app flow) if one is set; otherwise use
  // whatever the OAuth install flow at /auth/shopify saved.
  const accessToken = config.shopify.accessToken || tokenStore.readToken();
  if (!shopDomain || !accessToken) {
    throw new Error(
      "Shopify is not configured — set SHOPIFY_ACCESS_TOKEN, or visit /auth/shopify to install the app and obtain one, or set MOCK_MODE=true"
    );
  }
  return axios.create({
    baseURL: `https://${shopDomain}/admin/api/${apiVersion}`,
    headers: {
      "X-Shopify-Access-Token": accessToken,
      "Content-Type": "application/json",
    },
    timeout: 15000,
  });
}

/**
 * Pulls orders, walking Shopify's Link-header cursor pagination (page_info)
 * until exhausted. Pass `days` to only pull orders created in that window;
 * omit it (the default) to pull the store's entire order history.
 * https://shopify.dev/docs/api/admin-rest/latest/resources/order
 */
async function fetchRecentOrders(days) {
  const http = client();

  let url = "/orders.json";
  let params = {
    status: "any",
    limit: 250,
    order: "created_at desc",
    ...(days ? { created_at_min: new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString() } : {}),
  };

  const orders = [];
  // Shopify paginates via the Link response header, not offsets.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const res = await http.get(url, { params });
    orders.push(...res.data.orders);

    const link = res.headers.link || res.headers.Link;
    const next = parseNextLink(link);
    if (!next) break;
    url = "/orders.json";
    params = next; // page_info replaces all other query params on subsequent pages
  }

  return orders;
}

function parseNextLink(linkHeader) {
  if (!linkHeader) return null;
  const match = linkHeader
    .split(",")
    .map((part) => part.trim())
    .find((part) => part.endsWith('rel="next"'));
  if (!match) return null;
  const urlMatch = match.match(/<([^>]+)>/);
  if (!urlMatch) return null;
  const pageInfo = new URL(urlMatch[1]).searchParams.get("page_info");
  return { limit: 250, page_info: pageInfo };
}

module.exports = { fetchRecentOrders };
