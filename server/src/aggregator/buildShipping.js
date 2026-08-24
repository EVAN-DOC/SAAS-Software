const config = require("../config");
const { cached } = require("../lib/cache");
const { formatINR } = require("../lib/money");
const { mapShipment } = require("./mapShipment");
const { getEnrichedOrders } = require("./enrichOrders");
const { mockOrders } = require("../mock/mockOrders");
const icarryReturnMap = require("../lib/icarryReturnMap");

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

// Demo-only data for the detail panel — mockOrders.js has no street
// address/phone (it was built for the finance dashboard, which never needed
// them), so these are synthesized deterministically from the order id.
const MOCK_STREETS = [
  "House No 23, Lake View Colony", "2nd Floor, Crescent Heights", "Shop 4, Model Town Market",
  "Flat 3B, Silver Oaks Apartments", "Villa 9, Orchid Enclave", "12/4 MG Road",
  "Room 201, Sunrise Residency", "17 Rajaji Nagar Main Road", "B-Wing 7, Palm Grove Society",
  "Plot 45, Green Valley Layout",
];
const MOCK_LANDMARKS = ["Near City Mall", "Opp. HDFC Bank", "Behind Central Park", "Next to Govt School", "Near Bus Stand"];
const MOCK_HUBS = ["Delhi", "Mumbai", "Bengaluru", "Hyderabad", "Pune", "Chennai", "Kolkata", "Hubli"];

function mockNum(orderId) {
  return Number(String(orderId).replace("#", "")) || 0;
}

function mockAddress(orderId) {
  const n = mockNum(orderId);
  return `${MOCK_STREETS[n % MOCK_STREETS.length]}, ${MOCK_LANDMARKS[n % MOCK_LANDMARKS.length]}`;
}

function mockPhone(orderId) {
  const n = mockNum(orderId);
  return `9${String(n).padStart(9, "0")}`.slice(0, 10);
}

function mockAwb(orderId) {
  return `ICY${1000000 + mockNum(orderId)}`;
}

function mockTrackHistory(orderId, shipStatus, date) {
  if (shipStatus === "notscheduled") return [];
  const n = mockNum(orderId);
  const start = new Date(date);
  const step = (days, note, location) => ({
    datetime: new Date(start.getTime() + days * 24 * 60 * 60 * 1000).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }),
    location,
    note,
  });
  const hub = MOCK_HUBS[n % MOCK_HUBS.length];
  const events = [step(0, "Shipment picked up", "Davangere"), step(1, "Arrived at hub", hub)];
  if (shipStatus === "transit") events.push(step(2, "In transit to destination", hub));
  if (shipStatus === "delivered") events.push(step(2, "Out for delivery", "Destination"), step(2, "Delivered", "Destination"));
  if (shipStatus === "rto") events.push(step(2, "Delivery attempt failed", "Destination"), step(3, "RTO — returned to origin", "Davangere"));
  return events;
}

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
  return mockOrders.map((o) => {
    const shipStatus = MOCK_SHIP_STATUS[o.shipCat] || "notscheduled";
    const trackHistory = mockTrackHistory(o.id, shipStatus, o.date);
    const latestEvent = trackHistory[trackHistory.length - 1] || null;
    return {
      id: o.id,
      date: o.date,
      customer: o.customer,
      loc: o.loc,
      items: o.items,
      type: o.type,
      value: mockValueLabel(o),
      shipStatus,
      shipLabel: undefined,
      courier: o.shipNote?.split(" · ")[1] || null,
      shipmentId: o.track ? "mock" : null,
      edd: null,
      trackHistory,
      address: mockAddress(o.id),
      phone: mockPhone(o.id),
      awb: shipStatus === "notscheduled" ? null : mockAwb(o.id),
      currentLocation: shipStatus !== "notscheduled" && shipStatus !== "delivered" ? latestEvent?.location || null : null,
      deliveredDate: shipStatus === "delivered" ? latestEvent?.datetime || null : null,
      returnPickup: shipStatus === "delivered" ? icarryReturnMap.getReturnPickup(o.id) : null,
      pincode: null,
      weightGrams: 500,
      shipmentValue: 0,
    };
  });
}

async function getShippingList() {
  return cached("shipping", async () => {
    const shipments = config.mockMode ? mockShipments() : (await getEnrichedOrders()).map((r) => mapShipment(r, formatINR));
    const sorted = [...shipments].sort((a, b) => new Date(b.date) - new Date(a.date));
    return { shipments: sorted, kpis: computeShipKpis(sorted), mock: config.mockMode };
  });
}

module.exports = { getShippingList };
