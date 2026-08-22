const config = require("../config");
const { cached } = require("../lib/cache");
const { pMap } = require("../lib/pMap");
const { formatINR } = require("../lib/money");
const { mapOrder } = require("./mapOrder");
const shopifyService = require("../services/shopifyService");
const cashfreeService = require("../services/cashfreeService");
const icarryService = require("../services/icarryService");
const icarryShipmentMap = require("../lib/icarryShipmentMap");
const icarryNdrStore = require("../lib/icarryNdrStore");
const { mockOrders } = require("../mock/mockOrders");

async function fetchLiveOrders() {
  const shopifyOrders = await shopifyService.fetchRecentOrders(config.shopify.orderLookbackDays);

  return pMap(
    shopifyOrders,
    async (shopifyOrder) => {
      // Cashfree is found via the order's transaction record — see
      // shopifyService.findCashfreePayment() for why this store has two
      // different shapes depending on prepaid vs partial-COD.
      //
      // iCarry tracking needs their own shipment_id, which isn't derivable
      // from Shopify data directly — resolved via a local mapping file built
      // by scripts/importIcarryShipments.js from an iCarry shipments export.
      // Orders not in that mapping (not yet exported, or genuinely not
      // shipped through iCarry) just show as not-yet-tracked.
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
      const icarryRemit = null;

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

      return mapOrder({ shopifyOrder, cashfreePayment, cashfreeSettlement, icarryTracking, icarryRemit, icarryNdr });
    },
    // Kept low because each order does a Shopify transactions.json lookup,
    // and standard Shopify apps are rate-limited to 2 req/s (see the 429
    // retry handling in shopifyService.js's client()).
    2
  );
}

function numFromVal(v) {
  return parseFloat(String(v).replace(/[₹,]/g, "").trim()) * (String(v).includes("-") ? -1 : 1);
}

function computeKpis(orders) {
  const settledConfirmed = orders.reduce(
    (s, o) => s + o.legs.filter((l) => l.tag === "confirmed" && l.cls === "g").reduce((a, l) => a + numFromVal(l.val), 0),
    0
  );
  const pendingEst = orders.reduce(
    (s, o) => s + o.legs.filter((l) => l.tag === "estimated" && (l.cls === "a" || l.cls === "p")).reduce((a, l) => a + numFromVal(l.val), 0),
    0
  );
  const alertCount = orders.filter((o) => o.wa).length;
  const rtoCount = orders.filter((o) => o.shipCat === "rto").length;
  const netLoss =
    orders.reduce((s, o) => (o.net && !o.net.pos ? s + Math.abs(numFromVal(o.net.val)) : s), 0) -
    orders.reduce((s, o) => (o.net && o.net.pos ? s + numFromVal(o.net.val) : s), 0);

  return [
    { key: "settled", l: "Settled to Bank", v: formatINR(settledConfirmed), f: "Confirmed, order-by-order", cls: "green" },
    { key: "pending", l: "Expected Soon", v: formatINR(pendingEst), f: "With settlement dates shown", cls: "amber" },
    { key: "alerts", l: "WhatsApp Alerts Sent", v: String(alertCount), f: "Founder notified automatically", cls: "purple" },
    { key: "rto", l: "RTO Events", v: String(rtoCount), f: "This week", cls: "red" },
    { key: "rtoImpact", l: "Net RTO Impact", v: (netLoss >= 0 ? "-" : "+") + formatINR(Math.abs(netLoss)), f: "Freight loss vs. kept advances", cls: "red" },
  ];
}

async function getDashboard() {
  return cached("dashboard", async () => {
    const orders = config.mockMode ? mockOrders : await fetchLiveOrders();
    const sorted = [...orders].sort((a, b) => new Date(b.date) - new Date(a.date));
    return { orders: sorted, kpis: computeKpis(sorted), mock: config.mockMode };
  });
}

module.exports = { getDashboard };
