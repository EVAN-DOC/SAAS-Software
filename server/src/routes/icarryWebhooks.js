const express = require("express");
const config = require("../config");
const icarryShipmentMap = require("../lib/icarryShipmentMap");
const icarryNdrStore = require("../lib/icarryNdrStore");

const router = express.Router();

// Terminal states — once a shipment reaches one of these, any earlier NDR
// flag no longer matters for the "needs attention" view.
const TERMINAL_STATUS_CODES = new Set([7, 14, 16, 21, 23]); // Canceled, Lost, Voided, Delivered, Returned to Origin

function verifyToken(req, res) {
  const token = req.body?.token;
  if (!token || token !== config.icarry.apiKey) {
    res.status(401).json({ error: "Invalid or missing token" });
    return false;
  }
  return true;
}

/**
 * iCarry's "Webhook / POST Call Back on change in Shipment STATUS".
 * Register this URL (once publicly reachable) at: iCarry panel > Account >
 * Integrations > API Credentials > "Webhook URL to get Shipment Status".
 *
 * Two jobs: (1) learn shipment_id <-> Shopify order mappings automatically
 * for new orders, so we stop depending on manual CSV re-imports, and (2)
 * clear any stale NDR flag once a shipment reaches a terminal state.
 */
router.post("/status", (req, res) => {
  if (!verifyToken(req, res)) return;

  const { shipment_id, client_order_id, status } = req.body;
  console.log(`[iCarry webhook] status: shipment ${shipment_id}, order ${client_order_id}, status code ${status}`);

  if (client_order_id && /^#/.test(client_order_id) && shipment_id) {
    icarryShipmentMap.setShipmentId(client_order_id, String(shipment_id));
  }

  const statusCode = Number(status);
  if (shipment_id && TERMINAL_STATUS_CODES.has(statusCode)) {
    icarryNdrStore.clearNdr(String(shipment_id));
  }

  res.json({ success: true });
});

/**
 * iCarry's "Webhook / POST Call Back for NDR events" — sent as JSON, unlike
 * the other two webhooks. Register at the same panel page under "Webhook
 * URL to get NDR event". No `token` field is documented for this one, so it
 * isn't verified the same way — treat it as lower-trust (log only, don't
 * let it silently fail the rest of the app if malformed).
 */
router.post("/ndr", (req, res) => {
  const ndrData = req.body?.ndr_data;
  if (!Array.isArray(ndrData)) {
    return res.status(400).json({ error: "Missing ndr_data array" });
  }

  for (const event of ndrData) {
    if (!event?.shipment_id) continue;
    console.log(`[iCarry webhook] NDR: shipment ${event.shipment_id}, type ${event.type}`);
    icarryNdrStore.recordNdr(String(event.shipment_id), {
      type: event.type,
      dateAdded: event.date_added,
      awb: event.awb,
    });
  }

  res.json({ success: true });
});

/**
 * iCarry's "Webhook / POST Call Back for Weight Dispute events". Register
 * at the same panel page under "Webhook URL to get Weight Dispute event".
 * Not wired into the dashboard UI yet — logged for visibility only.
 */
router.post("/weight-dispute", (req, res) => {
  if (!verifyToken(req, res)) return;
  const { shipment_id, old_weight, new_weight } = req.body;
  console.log(`[iCarry webhook] weight dispute: shipment ${shipment_id}, ${old_weight}g -> ${new_weight}g`);
  res.json({ success: true });
});

module.exports = router;
