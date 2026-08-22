/**
 * One-time (repeatable) import: matches rows from an iCarry "Shipments
 * Report" export (My Account > My Shipments > Export in their panel) to
 * this store's Shopify orders, and saves the resulting
 * { shopifyOrderName: icarryShipmentId } map to .data/icarry_shipment_map.json.
 *
 * Needed because iCarry's tracking API requires their own shipment_id, and
 * there's no documented way to look that up from a Shopify order — see the
 * module doc comment in src/services/icarryService.js for the full context.
 *
 * Matching strategy, in order of confidence:
 *   1. The export's "Client Order Id" column, when present, IS the Shopify
 *      order name (e.g. "#1633") for this store — direct match.
 *   2. Otherwise, match on customer mobile number (both sides store it as a
 *      plain 10-digit string). If a phone number maps to more than one
 *      Shopify order, disambiguate using shipment value vs. order total;
 *      if still ambiguous, the row is left unresolved rather than guessed.
 *
 * Usage: npm run import:icarry-shipments -- "C:\path\to\shipments_report.xlsx"
 */
require("dotenv").config();
const path = require("path");
const fs = require("fs");
const XLSX = require("xlsx");
const shopifyService = require("../src/services/shopifyService");

const MAP_FILE = path.join(__dirname, "..", ".data", "icarry_shipment_map.json");

function normalizePhone(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : null;
}

function loadExistingMap() {
  try {
    return JSON.parse(fs.readFileSync(MAP_FILE, "utf8"));
  } catch {
    return {};
  }
}

async function main() {
  const xlsxPath = process.argv[2];
  if (!xlsxPath) {
    console.error('Usage: npm run import:icarry-shipments -- "C:\\path\\to\\shipments_report.xlsx"');
    process.exit(1);
  }
  if (!fs.existsSync(xlsxPath)) {
    console.error(`File not found: ${xlsxPath}`);
    process.exit(1);
  }

  console.log("Fetching full Shopify order history for matching...");
  const shopifyOrders = await shopifyService.fetchRecentOrders();
  console.log(`Fetched ${shopifyOrders.length} Shopify orders.`);

  const byName = new Map(shopifyOrders.map((o) => [o.name, o]));
  const byPhone = new Map();
  for (const o of shopifyOrders) {
    const phone = normalizePhone(o.phone || o.shipping_address?.phone || o.customer?.default_address?.phone);
    if (!phone) continue;
    if (!byPhone.has(phone)) byPhone.set(phone, []);
    byPhone.get(phone).push(o);
  }

  const wb = XLSX.readFile(xlsxPath);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
  console.log(`Loaded ${rows.length} shipment rows from ${path.basename(xlsxPath)}.`);

  const map = loadExistingMap();
  const startingCount = Object.keys(map).length;
  let exactMatches = 0;
  let phoneMatches = 0;
  let ambiguous = 0;
  let unresolved = 0;

  for (const row of rows) {
    const shipmentId = row["Shipment Id"];
    if (!shipmentId) continue;

    const clientOrderId = String(row["Client Order Id"] || "").trim();
    let matchedOrder = clientOrderId ? byName.get(clientOrderId) : null;
    if (matchedOrder) {
      exactMatches++;
    } else {
      const phone = normalizePhone(row["Mobile"]);
      const candidates = phone ? byPhone.get(phone) || [] : [];
      if (candidates.length === 1) {
        matchedOrder = candidates[0];
        phoneMatches++;
      } else if (candidates.length > 1) {
        const value = Number(row["Shipment Value"]) || 0;
        const close = candidates.filter((o) => Math.abs(Number(o.total_price) - value) < 5);
        if (close.length === 1) {
          matchedOrder = close[0];
          phoneMatches++;
        } else {
          ambiguous++;
        }
      } else {
        unresolved++;
      }
    }

    if (matchedOrder) {
      map[matchedOrder.name] = shipmentId;
    }
  }

  fs.mkdirSync(path.dirname(MAP_FILE), { recursive: true });
  fs.writeFileSync(MAP_FILE, JSON.stringify(map, null, 2));

  console.log(`
Import complete.
  Exact matches (Client Order Id):        ${exactMatches}
  Phone-based matches:                    ${phoneMatches}
  Ambiguous (couldn't safely disambiguate): ${ambiguous}
  Unresolved (no matching order found):   ${unresolved}
  New mappings added this run:            ${Object.keys(map).length - startingCount}
  Total mapped orders now:                ${Object.keys(map).length}
  Saved to: ${MAP_FILE}
`);
}

main().catch((err) => {
  console.error("Import failed:", err.message);
  process.exit(1);
});
