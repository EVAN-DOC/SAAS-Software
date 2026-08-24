/**
 * One-time (repeatable) backfill: pushes every known iCarry shipment_id (and
 * awb, if we have one) from .data/icarry_shipment_map.json /
 * icarry_awb_map.json onto the matching Shopify order as metafields —
 * admin-only internal reference, no fulfillment change, no customer
 * notification. See shopifyService.setIcarryReferenceMetafields().
 *
 * Needed because the metafield write only happens automatically going
 * forward (on a fresh booking, or the next status webhook event) — orders
 * mapped by the historical CSV import (scripts/importIcarryShipments.js)
 * never trigger either of those on their own.
 *
 * Usage: npm run push:icarry-shipment-ids
 */
require("dotenv").config();
const path = require("path");
const fs = require("fs");
const shopifyService = require("../src/services/shopifyService");
const { pMap } = require("../src/lib/pMap");

const SHIPMENT_MAP_FILE = path.join(__dirname, "..", ".data", "icarry_shipment_map.json");
const AWB_MAP_FILE = path.join(__dirname, "..", ".data", "icarry_awb_map.json");

function loadJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

async function main() {
  const shipmentMap = loadJson(SHIPMENT_MAP_FILE);
  const awbMap = loadJson(AWB_MAP_FILE);
  const orderNames = Object.keys(shipmentMap);

  if (!orderNames.length) {
    console.log(`No entries in ${SHIPMENT_MAP_FILE} — nothing to push.`);
    return;
  }

  console.log(`Ensuring the icarry.shipment_id metafield definition exists (and is pinned as an Orders column)...`);
  await shopifyService.ensureIcarryShipmentIdMetafieldDefinition();

  console.log(`Pushing ${orderNames.length} shipment id(s) to Shopify...`);

  let pushed = 0;
  let skippedNoOrder = 0;
  let failed = 0;

  await pMap(
    orderNames,
    async (orderName) => {
      try {
        const shopifyOrderId = await shopifyService.findOrderIdByName(orderName);
        if (!shopifyOrderId) {
          console.warn(`  ${orderName}: no matching Shopify order found — skipped`);
          skippedNoOrder++;
          return;
        }
        await shopifyService.setIcarryReferenceMetafields(shopifyOrderId, {
          shipmentId: shipmentMap[orderName],
          awb: awbMap[orderName] || null,
        });
        pushed++;
      } catch (err) {
        console.warn(`  ${orderName}: FAILED — ${err.message}`);
        failed++;
      }
    },
    2 // stay under Shopify's 2 req/s standard rate limit (2 calls per order)
  );

  console.log(`
Done.
  Pushed:              ${pushed}
  Skipped (no order):  ${skippedNoOrder}
  Failed:              ${failed}
`);
}

main().catch((err) => {
  console.error("Backfill failed:", err.message);
  process.exit(1);
});
