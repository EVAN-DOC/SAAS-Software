const config = require("../config");
const { cached } = require("../lib/cache");
const { formatINR } = require("../lib/money");
const { mapOrder } = require("./mapOrder");
const { getEnrichedOrders } = require("./enrichOrders");
const { mockOrders } = require("../mock/mockOrders");

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
    const orders = config.mockMode ? mockOrders : (await getEnrichedOrders()).map(mapOrder);
    const sorted = [...orders].sort((a, b) => new Date(b.date) - new Date(a.date));
    return { orders: sorted, kpis: computeKpis(sorted), mock: config.mockMode };
  });
}

module.exports = { getDashboard };
