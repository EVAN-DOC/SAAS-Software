const config = require("../config");
const { cached } = require("../lib/cache");
const { formatINR } = require("../lib/money");
const { mapShipment } = require("./mapShipment");
const { getEnrichedOrders } = require("./enrichOrders");
const { mockOrders } = require("../mock/mockOrders");

function computeShipKpis(shipments) {
  const counts = { notscheduled: 0, scheduled: 0, transit: 0, delivered: 0, rto: 0 };
  shipments.forEach((s) => { counts[s.shipStatus] = (counts[s.shipStatus] || 0) + 1; });
  return [
    { key: "notscheduled", l: "Not Scheduled", v: String(counts.notscheduled), cls: "red" },
    { key: "scheduled", l: "Scheduled", v: String(counts.scheduled + counts.transit), cls: "blue" },
    { key: "delivered", l: "Delivered", v: String(counts.delivered), cls: "green" },
    { key: "rto", l: "RTO", v: String(counts.rto), cls: "amber" },
  ];
}

// Demo-mode approximation: mockOrders (built for the finance dashboard) uses
// a different shipCat vocabulary — map it onto this page's 5-state model
// rather than maintaining a second full mock dataset.
const MOCK_SHIP_STATUS = { unful: "notscheduled", transit: "transit", delivered: "delivered", rto: "rto", ndr: "transit", cancelled: "notscheduled" };

function mockValueLabel(o) {
  // mockOrders' legs start with [Advance, Balance] for partial orders (a
  // possible 3rd RTO-freight leg doesn't affect this), or a single
  // full-order leg otherwise.
  if (o.type === "partial" && o.legs[0] && o.legs[1]) {
    return `${o.legs[0].val} advance + ${o.legs[1].val} COD`;
  }
  return o.legs[0]?.val || "—";
}

function mockShipments() {
  return mockOrders.map((o) => ({
    id: o.id,
    date: o.date,
    customer: o.customer,
    loc: o.loc,
    items: o.items,
    type: o.type,
    value: mockValueLabel(o),
    shipStatus: MOCK_SHIP_STATUS[o.shipCat] || "notscheduled",
    shipLabel: undefined,
    courier: o.shipNote?.split(" · ")[1] || null,
    shipmentId: o.track ? "mock" : null,
    edd: null,
    trackHistory: [],
    pincode: null,
    weightGrams: 500,
    shipmentValue: 0,
  }));
}

async function getShippingList() {
  return cached("shipping", async () => {
    const shipments = config.mockMode ? mockShipments() : (await getEnrichedOrders()).map((r) => mapShipment(r, formatINR));
    const sorted = [...shipments].sort((a, b) => new Date(b.date) - new Date(a.date));
    return { shipments: sorted, kpis: computeShipKpis(sorted), mock: config.mockMode };
  });
}

module.exports = { getShippingList };
