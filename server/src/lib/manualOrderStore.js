const fs = require("fs");
const path = require("path");

const FILE = path.join(__dirname, "..", "..", ".data", "manual_orders.json");

let cached = null;

/**
 * { reference: { tag, label, note, consignee, parcel, mode, payment,
 *   courier, shipmentId, awb, courierName, trackingUrl, bookedAt } } —
 * shipments booked for people who never placed a real Shopify order
 * (influencers, family, complimentary sends, counter sales). These never
 * appear anywhere else in this app — see routes/manualOrders.js — this file
 * is their only record.
 */
function load() {
  if (cached) return cached;
  try {
    cached = JSON.parse(fs.readFileSync(FILE, "utf8"));
  } catch {
    cached = {};
  }
  return cached;
}

function save(map) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(map, null, 2));
}

/** Next unused reference for a given tag prefix, e.g. "INF-004" — scans existing records rather than keeping a separate counter, so it can't drift out of sync. */
function nextReference(tagPrefix) {
  const map = load();
  const used = Object.keys(map)
    .filter((ref) => ref.startsWith(`${tagPrefix}-`))
    .map((ref) => Number(ref.slice(tagPrefix.length + 1)))
    .filter((n) => Number.isInteger(n));
  const next = (used.length ? Math.max(...used) : 0) + 1;
  return `${tagPrefix}-${String(next).padStart(3, "0")}`;
}

function getOrder(reference) {
  return load()[reference] || null;
}

function getAllOrders() {
  return load();
}

function saveOrder(reference, record) {
  const map = load();
  map[reference] = record;
  save(map);
}

module.exports = { nextReference, getOrder, getAllOrders, saveOrder };
