const config = require("../config");
const { cached } = require("../lib/cache");
const { pMap } = require("../lib/pMap");
const shopifyService = require("../services/shopifyService");
const cashfreeService = require("../services/cashfreeService");
const icarryService = require("../services/icarryService");
const icarryShipmentMap = require("../lib/icarryShipmentMap");
const icarryNdrStore = require("../lib/icarryNdrStore");

/**
 * The one expensive fetch: pulls every Shopify order and joins Cashfree
 * payment/settlement + iCarry tracking/NDR data onto each. Cached (stale-
 * while-revalidate, see lib/cache.js) under "enriched" so the finance
 * dashboard (buildDashboard.js) and the shipping dashboard
 * (buildShipping.js) share one pass instead of each re-running the ~6
 * minute Shopify-rate-limited sync independently.
 *
 * Returns raw joined records — NOT yet shaped for either UI. Each page's
 * own mapper (mapOrder.js / mapShipment.js) formats these for its view.
 */
// Hard backstop for a single order's whole enrichment pipeline (Shopify +
// iCarry + Cashfree calls, run sequentially below). Every individual HTTP
// client already sets its own timeout (15s), but lib/pMap.js only runs 2 of
// these at once — if one order's sequence of calls stacks up (retries,
// slow responses, anything not caught by a per-call timeout), it blocks
// that worker from ever reaching the rest of the queue, which is what's
// made the whole sync look "stuck" for 10+ minutes multiple times. This
// guarantees no single order can hold a worker longer than ORDER_TIMEOUT_MS
// — on timeout it's returned with no enrichment, exactly as if every call
// inside had failed, and gets picked up correctly on the next sync cycle.
const ORDER_TIMEOUT_MS = 60000;

function withOrderTimeout(promise, fallback) {
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(fallback), ORDER_TIMEOUT_MS);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function fetchEnrichedOrders() {
  const shopifyOrders = await shopifyService.fetchRecentOrders(config.shopify.orderLookbackDays);

  return pMap(
    shopifyOrders,
    async (shopifyOrder) =>
      withOrderTimeout(enrichOneOrder(shopifyOrder), {
        shopifyOrder,
        cashfreePayment: null,
        cashfreeSettlement: null,
        icarryTracking: null,
        icarryNdr: null,
        icarryRemit: null,
        icarryShipmentId: null,
      }),
    // Kept low because each order does a Shopify transactions.json lookup,
    // and standard Shopify apps are rate-limited to 2 req/s (see the 429
    // retry handling in shopifyService.js's client()).
    2
  );
}

async function enrichOneOrder(shopifyOrder) {
  // iCarry tracking needs their own shipment_id, which isn't derivable
  // from Shopify data directly. Shopify's own icarry.shipment_id
  // metafield (written by the status webhook, or the one-time
  // pushIcarryShipmentIdsToShopify backfill) is the real, durable source
  // — it survives a redeploy, unlike the local .data mapping file. Fall
  // back to that local file (built by scripts/importIcarryShipments.js)
  // only for orders that haven't had a metafield written yet.
  let icarryShipmentId = null;
  try {
    const ref = await shopifyService.getIcarryReference(shopifyOrder.id);
    icarryShipmentId = ref.shipmentId;
  } catch {
    icarryShipmentId = null;
  }
  if (!icarryShipmentId) {
    icarryShipmentId = icarryShipmentMap.getShipmentId(shopifyOrder.name);
  }
  let icarryTracking = null;
  if (icarryShipmentId) {
    try {
      const result = await icarryService.trackShipment(icarryShipmentId);
      icarryTracking = result?.success ? result : null;
    } catch {
      icarryTracking = null;
    }
  }
  // NDR isn't part of the TRACK response's status vocabulary — it's a
  // separate signal pushed by iCarry's NDR webhook (see
  // routes/icarryWebhooks.js), layered on top of whatever the shipment's
  // last known status was.
  const icarryNdr = icarryShipmentId ? icarryNdrStore.getNdr(icarryShipmentId) : null;

  // COD remittance (has this shipment's cash-on-delivery amount actually
  // been paid out to us yet) — separate call from TRACK, only meaningful
  // once a shipment_id exists.
  let icarryRemit = null;
  if (icarryShipmentId) {
    try {
      const result = await icarryService.getRemittanceDetail(icarryShipmentId);
      icarryRemit = result?.success ? result : null;
    } catch {
      icarryRemit = null;
    }
  }

  let cfPayment = null;
  try {
    cfPayment = await shopifyService.findCashfreePayment(shopifyOrder.id);
  } catch {
    cfPayment = null;
  }

  let cashfreePayment = null;
  if (cfPayment?.orderId) {
    try {
      const payments = await cashfreeService.fetchPaymentsForOrder(cfPayment.orderId);
      cashfreePayment = payments?.[0] || null;
    } catch {
      cashfreePayment = null;
    }
  }

  let cashfreeSettlement = null;
  if (cashfreePayment) {
    try {
      const settlements = await cashfreeService.fetchSettlementsForOrder(cfPayment.orderId);
      // Cashfree returns a single settlement object per order for this
      // account (confirmed against a live order), not an array — but
      // tolerate an array shape too in case that varies by account/version.
      cashfreeSettlement = Array.isArray(settlements) ? settlements[0] || null : settlements || null;
    } catch {
      cashfreeSettlement = null;
    }
  } else if (cfPayment && !cfPayment.orderId) {
    // Partial-COD advance path: no Cashfree order_id to query via
    // fetchSettlementsForOrder, but Shopify already confirmed the
    // capture succeeded — surface that instead of showing nothing.
    // Real settlement proof IS still resolvable here, just via a
    // different route: the settlement reconciliation endpoint can look
    // up a payment directly by cf_payment_id (confirmed live — this
    // used to be treated as unresolvable, it wasn't).
    cashfreePayment = { order_amount: cfPayment.amount, payment_status: "SUCCESS", cf_payment_id: cfPayment.cfPaymentId };
    if (cfPayment.cfPaymentId) {
      try {
        cashfreeSettlement = await cashfreeService.findSettlementByPaymentId(cfPayment.cfPaymentId);
      } catch {
        cashfreeSettlement = null;
      }
    }
  }

  return { shopifyOrder, cashfreePayment, cashfreeSettlement, icarryTracking, icarryNdr, icarryRemit, icarryShipmentId };
}

async function getEnrichedOrders() {
  return cached("enriched", fetchEnrichedOrders);
}

module.exports = { getEnrichedOrders };
