const fs = require("fs");
const path = require("path");

const FILE = path.join(__dirname, "..", "..", ".data", "icarry_return_map.json");

let cached = null;

/**
 * { shopifyOrderName: { awb, courierName, trackingUrl, pickupId, scheduledAt } }
 * — set once a reverse pickup is booked via REVERSE Shipment (see
 * routes/shipments.js), so the dashboard can show "already scheduled" on
 * reload instead of allowing a duplicate booking.
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

function getReturnPickup(shopifyOrderName) {
  return load()[shopifyOrderName] || null;
}

function setReturnPickup(shopifyOrderName, info) {
  const map = load();
  map[shopifyOrderName] = info;
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(map, null, 2));
}

module.exports = { getReturnPickup, setReturnPickup };
