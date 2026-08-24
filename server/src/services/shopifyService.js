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
  const instance = axios.create({
    baseURL: `https://${shopDomain}/admin/api/${apiVersion}`,
    headers: {
      "X-Shopify-Access-Token": accessToken,
      "Content-Type": "application/json",
    },
    timeout: 15000,
  });

  // Standard Shopify apps are capped at 2 req/s. Fetching per-order
  // transactions for hundreds of orders blows through that quickly — retry
  // 429s honoring Retry-After instead of letting the whole batch fail.
  instance.interceptors.response.use(undefined, async (error) => {
    const cfg = error.config;
    if (error.response?.status !== 429 || !cfg) throw error;
    cfg._retryCount = (cfg._retryCount || 0) + 1;
    if (cfg._retryCount > 5) throw error;
    const retryAfterSec = Number(error.response.headers["retry-after"]) || 1;
    await new Promise((resolve) => setTimeout(resolve, retryAfterSec * 1000));
    return instance(cfg);
  });

  return instance;
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

/**
 * Transactions carry the payment gateway's own reference for an order.
 * https://shopify.dev/docs/api/admin-rest/latest/resources/transaction
 */
async function fetchOrderTransactions(shopifyOrderId) {
  const http = client();
  const res = await http.get(`/orders/${shopifyOrderId}/transactions.json`);
  return res.data.transactions;
}

/**
 * Finds the successful Cashfree transaction for a Shopify order (if any) and
 * returns what we can resolve from it. Confirmed against this store's live
 * data that there are two different shapes:
 *  - Full-prepaid orders: gateway is the full descriptive app name
 *    ("1Cashfree Payments(...)"), and `payment_id` IS Cashfree's real
 *    order_id — usable with Cashfree's Orders API directly.
 *  - Partial-COD advance captures: gateway is just "Cashfree", `payment_id`
 *    is a Shopify-generated label ("#1626.2", not a Cashfree order_id), and
 *    `receipt.payment_id` is Cashfree's cf_payment_id — a different ID space
 *    that Cashfree's Orders API can't be queried by directly. In that case
 *    we can't fetch independent settlement proof, but Shopify itself already
 *    confirms the capture succeeded, so we surface that instead of nothing.
 */
async function findCashfreePayment(shopifyOrderId) {
  const transactions = await fetchOrderTransactions(shopifyOrderId);
  const tx = transactions.find(
    (t) => t.status === "success" && (t.kind === "sale" || t.kind === "capture") && /cashfree/i.test(t.gateway || "")
  );
  if (!tx) return null;

  const rawRef = tx.payment_id;
  const looksLikeShopifyLabel = !rawRef || /^#/.test(rawRef);
  return {
    orderId: looksLikeShopifyLabel ? null : rawRef,
    amount: Number(tx.amount),
    cfPaymentId: tx.receipt?.payment_id || null,
  };
}

/** Looks up a Shopify order's numeric id from its display name (e.g. "#1633") — needed to build a GraphQL gid for metafield writes. */
async function findOrderIdByName(name) {
  const http = client();
  const res = await http.get("/orders.json", { params: { name, status: "any", fields: "id,name" } });
  return res.data.orders?.[0]?.id || null;
}

async function graphql(query, variables) {
  const http = client();
  const res = await http.post("/graphql.json", { query, variables });
  if (res.data.errors) throw new Error(`Shopify GraphQL error: ${JSON.stringify(res.data.errors)}`);
  return res.data.data;
}

/**
 * Creates (and pins) the "icarry.shipment_id" metafield definition on the
 * Order resource so it's selectable as a column in Shopify admin's Orders
 * list (Orders > Edit columns) — internal-only reference, no storefront
 * visibility. Safe to call repeatedly: a "taken"/already-exists userError is
 * swallowed as a no-op rather than thrown.
 */
async function ensureIcarryShipmentIdMetafieldDefinition() {
  const data = await graphql(
    `#graphql
      mutation ensureIcarryShipmentIdDefinition($definition: MetafieldDefinitionInput!) {
        metafieldDefinitionCreate(definition: $definition) {
          createdDefinition { id }
          userErrors { field message code }
        }
      }`,
    {
      definition: {
        name: "iCarry Shipment ID",
        namespace: "icarry",
        key: "shipment_id",
        description: "Internal reference — this order's shipment id in iCarry (used to look up tracking/label/reverse-pickup).",
        ownerType: "ORDER",
        type: "single_line_text_field",
        pin: true,
      },
    }
  );
  const errors = data.metafieldDefinitionCreate.userErrors || [];
  const fatal = errors.filter((e) => e.code !== "TAKEN");
  if (fatal.length) {
    throw new Error(`Shopify metafieldDefinitionCreate userErrors: ${JSON.stringify(fatal)}`);
  }
  return data.metafieldDefinitionCreate.createdDefinition;
}

/**
 * Writes iCarry's shipment reference (shipment_id, awb, courier, tracking
 * url) onto the order as metafields — admin-only visibility, no fulfillment
 * status change, no customer notification. Requires the write_orders scope
 * (see config.js) — the app must be re-authorized via /auth/shopify after
 * that scope is added before this will succeed on a previously-installed token.
 */
async function setIcarryReferenceMetafields(shopifyOrderId, { shipmentId, awb, courierName, trackingUrl } = {}) {
  const ownerId = `gid://shopify/Order/${shopifyOrderId}`;
  const metafields = [
    shipmentId != null ? { ownerId, namespace: "icarry", key: "shipment_id", type: "single_line_text_field", value: String(shipmentId) } : null,
    awb ? { ownerId, namespace: "icarry", key: "awb", type: "single_line_text_field", value: String(awb) } : null,
    courierName ? { ownerId, namespace: "icarry", key: "courier_name", type: "single_line_text_field", value: String(courierName) } : null,
    trackingUrl ? { ownerId, namespace: "icarry", key: "tracking_url", type: "url", value: String(trackingUrl) } : null,
  ].filter(Boolean);
  if (!metafields.length) return null;

  const data = await graphql(
    `#graphql
      mutation setIcarryReferenceMetafields($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields { id namespace key value }
          userErrors { field message }
        }
      }`,
    { metafields }
  );
  if (data.metafieldsSet.userErrors?.length) {
    throw new Error(`Shopify metafieldsSet userErrors: ${JSON.stringify(data.metafieldsSet.userErrors)}`);
  }
  return data.metafieldsSet.metafields;
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

module.exports = {
  fetchRecentOrders,
  fetchOrderTransactions,
  findCashfreePayment,
  findOrderIdByName,
  setIcarryReferenceMetafields,
  ensureIcarryShipmentIdMetafieldDefinition,
};
