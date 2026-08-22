const fs = require("fs");
const path = require("path");

const FILE = path.join(__dirname, "..", "..", ".data", "icarry_shipment_map.json");

let cached = null;

/** { shopifyOrderName: icarryShipmentId }, built by scripts/importIcarryShipments.js and kept current by the status webhook. */
function load() {
  if (cached) return cached;
  try {
    cached = JSON.parse(fs.readFileSync(FILE, "utf8"));
  } catch {
    cached = {};
  }
  return cached;
}

function getShipmentId(shopifyOrderName) {
  return load()[shopifyOrderName] || null;
}

/** Called by the iCarry status webhook to learn new order->shipment mappings without a manual CSV re-import. */
function setShipmentId(shopifyOrderName, shipmentId) {
  const map = load();
  if (map[shopifyOrderName] === shipmentId) return;
  map[shopifyOrderName] = shipmentId;
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(map, null, 2));
}

module.exports = { getShipmentId, setShipmentId };
