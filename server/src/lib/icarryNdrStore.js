const fs = require("fs");
const path = require("path");

const FILE = path.join(__dirname, "..", "..", ".data", "icarry_ndr_events.json");

let cached = null;

function load() {
  if (cached) return cached;
  try {
    cached = JSON.parse(fs.readFileSync(FILE, "utf8"));
  } catch {
    cached = {};
  }
  return cached;
}

function save() {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(cached, null, 2));
}

/** { [shipmentId]: { type, dateAdded, awb } } — latest NDR event per shipment, from iCarry's NDR webhook. */
function recordNdr(shipmentId, { type, dateAdded, awb }) {
  const store = load();
  store[shipmentId] = { type, dateAdded, awb, recordedAt: new Date().toISOString() };
  save();
}

/** Cleared once a shipment moves past the NDR (e.g. delivered/RTO) so it doesn't keep flagging as "needs attention" forever. */
function clearNdr(shipmentId) {
  const store = load();
  if (store[shipmentId]) {
    delete store[shipmentId];
    save();
  }
}

function getNdr(shipmentId) {
  return load()[shipmentId] || null;
}

module.exports = { recordNdr, clearNdr, getNdr };
