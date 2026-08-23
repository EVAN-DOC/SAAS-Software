const fs = require("fs");
const path = require("path");

const FILE = path.join(__dirname, "..", "..", ".data", "icarry_awb_map.json");

let cached = null;

/**
 * { shopifyOrderName: awb }. iCarry's TRACK response has no awb field (see
 * icarryService.js doc comment) and the status webhook doesn't carry one
 * either — the only place this app ever sees an AWB is the BOOK response at
 * the moment a shipment is created here, so that's captured and persisted
 * on booking (see routes/shipments.js). Orders whose shipment_id came from
 * the historical CSV import (scripts/importIcarryShipments.js) won't have an
 * entry here unless that export also carried an AWB column worth re-importing.
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

function getAwb(shopifyOrderName) {
  return load()[shopifyOrderName] || null;
}

function setAwb(shopifyOrderName, awb) {
  const map = load();
  if (map[shopifyOrderName] === awb) return;
  map[shopifyOrderName] = awb;
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(map, null, 2));
}

module.exports = { getAwb, setAwb };
