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
async function fetchEnrichedOrders() {
  const shopifyOrders = await shopifyService.fetchRecentOrders(config.shopify.orderLookbackDays);

  return pMap(
    shopifyOrders,
    async (shopifyOrder) => {
      // iCarry tracking needs their own shipment_id, which isn't derivable
      // from Shopify data directly — resolved via a local mapping file built
      // by scripts/importIcarryShipments.js from an iCarry shipments export,
      // and kept current going forward by the status webhook.
      const icarryShipmentId = icarryShipmentMap.getShipmentId(shopifyOrder.name);
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
        // Partial-COD advance path: no Cashfree order_id to query, but
        // Shopify already confirmed the capture succeeded — surface that
        // instead of showing nothing. No independent settlement proof (no
        // UTR) is available for this path, so cashfreeSettlement stays null.
        cashfreePayment = { order_amount: cfPayment.amount, payment_status: "SUCCESS", cf_payment_id: cfPayment.cfPaymentId };
      }

      return { shopifyOrder, cashfreePayment, cashfreeSettlement, icarryTracking, icarryNdr, icarryRemit, icarryShipmentId };
    },
    // Kept low because each order does a Shopify transactions.json lookup,
    // and standard Shopify apps are rate-limited to 2 req/s (see the 429
    // retry handling in shopifyService.js's client()).
    2
  );
}

async function getEnrichedOrders() {
  return cached("enriched", fetchEnrichedOrders);
}

module.exports = { getEnrichedOrders };
