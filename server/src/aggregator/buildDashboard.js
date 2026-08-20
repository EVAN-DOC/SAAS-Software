const config = require("../config");
const { cached } = require("../lib/cache");
const { pMap } = require("../lib/pMap");
const { formatINR } = require("../lib/money");
const { mapOrder } = require("./mapOrder");
const shopifyService = require("../services/shopifyService");
const cashfreeService = require("../services/cashfreeService");
const icarryService = require("../services/icarryService");
const { mockOrders } = require("../mock/mockOrders");

async function fetchLiveOrders() {
  const shopifyOrders = await shopifyService.fetchRecentOrders(config.shopify.orderLookbackDays);

  return pMap(
    shopifyOrders,
    async (shopifyOrder) => {
      // Joined on Shopify order name — make sure this is the reference/order_id
      // you pass to Cashfree and iCarry when the order is placed/fulfilled.
      const key = shopifyOrder.name;

      const [cashfreeResult, icarryResult] = await Promise.allSettled([
        cashfreeService.fetchPaymentsForOrder(key),
        icarryService.trackShipment(key),
      ]);

      const cashfreePayment =
        cashfreeResult.status === "fulfilled" ? cashfreeResult.value?.[0] : null;

      let cashfreeSettlement = null;
      if (cashfreePayment) {
        try {
          const settlements = await cashfreeService.fetchSettlementsForOrder(key);
          cashfreeSettlement = settlements?.[0] || null;
        } catch {
          cashfreeSettlement = null;
        }
      }

      const icarryTracking = icarryResult.status === "fulfilled" ? icarryResult.value : null;

      let icarryRemit = null;
      if (icarryTracking) {
        try {
          const remit = await icarryService.fetchRemittances({});
          icarryRemit = (remit?.items || []).find((r) => r.reference === key) || null;
        } catch {
          icarryRemit = null;
        }
      }

      return mapOrder({ shopifyOrder, cashfreePayment, cashfreeSettlement, icarryTracking, icarryRemit });
    },
    5
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
