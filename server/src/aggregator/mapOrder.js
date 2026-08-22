const { formatINR } = require("../lib/money");
const { mapTrackingStatus } = require("../services/icarryService");

const SHIP_LABELS = {
  delivered: "Delivered",
  transit: "In-Transit",
  rto: "RTO",
  ndr: "NDR — Action Needed",
  unful: "Not Dispatched",
  cancelled: "Cancelled",
};

/**
 * Determines prepaid / cod / partial from a Shopify order.
 *
 * Confirmed against this store's live data: its checkout (Fastrr) marks a
 * partial-COD order using Shopify's own native `financial_status:
 * "partially_paid"` — the advance is captured via Cashfree, the balance is
 * left as COD. Falls back to a tag/note_attributes check for stores using a
 * different partial-COD app that doesn't set that native status.
 */
function classifyOrderType(shopifyOrder) {
  if (shopifyOrder.financial_status === "partially_paid") return "partial";

  const tags = (shopifyOrder.tags || "").toLowerCase();
  const advanceAttr = (shopifyOrder.note_attributes || []).find((a) =>
    /advance[_-]?amount/i.test(a.name)
  );
  if (tags.includes("partial-cod") || tags.includes("partial_cod") || advanceAttr) {
    return "partial";
  }
  if (shopifyOrder.financial_status === "paid") return "prepaid";
  return "cod";
}

/** Builds a human-readable note from iCarry's real TRACK response shape (status/location/details[].notes). */
function shipNoteFrom(icarryTracking) {
  if (!icarryTracking?.status) return "Awaiting courier update";
  const details = icarryTracking.details || [];
  const latestNote = details[details.length - 1]?.notes;
  const parts = [latestNote || icarryTracking.status, icarryTracking.courier_name].filter(Boolean);
  return parts.join(" · ");
}

function customerLocation(shopifyOrder) {
  const addr = shopifyOrder.shipping_address || shopifyOrder.billing_address;
  if (!addr) return "—";
  return [addr.city, addr.province_code || addr.province].filter(Boolean).join(", ");
}

function customerName(shopifyOrder) {
  const c = shopifyOrder.customer;
  if (c && (c.first_name || c.last_name)) {
    return [c.first_name, c.last_name].filter(Boolean).join(" ");
  }
  const addr = shopifyOrder.shipping_address;
  return addr ? addr.name : "Guest";
}

function itemsSummary(shopifyOrder) {
  return (shopifyOrder.line_items || [])
    .map((li) => `${li.title}${li.variant_title ? " · " + li.variant_title : ""}`)
    .join(" · ");
}

function buildLegs({ orderType, grossTotal, cashfreePayment, cashfreeSettlement, icarryRemit, shipCat }) {
  const legs = [];

  // Two levels of confidence: `transfer_utr` is independent proof the money
  // actually hit the bank; failing that, Cashfree/Shopify reporting the
  // payment captured is still real (just not bank-settlement-verified) —
  // see shopifyService.findCashfreePayment() for why not every order has a
  // path to the stronger signal.
  function cashfreeStatus() {
    const settledToBank = Boolean(cashfreeSettlement?.transfer_utr);
    const captured =
      settledToBank || cashfreePayment?.payment_status === "SUCCESS" || cashfreePayment?.order_status === "PAID";
    const note = settledToBank
      ? `Settled to bank · UTR ${cashfreeSettlement.transfer_utr}`
      : captured
      ? "Captured via Cashfree · bank settlement not independently verified"
      : "Expected settlement per Cashfree T+2 cycle";
    return { settledToBank, captured, note };
  }

  if (orderType === "prepaid") {
    const fee = cashfreeSettlement?.settlement_amount != null
      ? grossTotal - cashfreeSettlement.settlement_amount
      : null;
    const { captured, note } = cashfreeStatus();
    legs.push({
      name: "Prepaid — Full Order",
      amt: fee != null
        ? `${formatINR(grossTotal)} gross · −${formatINR(fee)} PG fee`
        : `${formatINR(grossTotal)} gross`,
      val: formatINR(cashfreeSettlement?.settlement_amount ?? cashfreePayment?.order_amount ?? grossTotal),
      cls: captured ? "g" : "a",
      tag: captured ? "confirmed" : "estimated",
      note,
    });
  }

  if (orderType === "cod") {
    const courierFee = icarryRemit?.courier_fee ?? null;
    const remitted = Boolean(icarryRemit?.remittance_id);
    legs.push({
      name: "COD — Full Order",
      amt: courierFee != null
        ? `${formatINR(grossTotal)} gross · −${formatINR(courierFee)} courier fee`
        : `${formatINR(grossTotal)} gross`,
      val: formatINR(grossTotal - (courierFee || 0)),
      cls: remitted ? "g" : "a",
      tag: remitted ? "confirmed" : "estimated",
      note: remitted
        ? `Remitted · Batch #${icarryRemit.remittance_id}`
        : "Expected remittance per iCarry COD cycle",
    });
  }

  if (orderType === "partial") {
    // cashfreePayment.order_amount reflects the actual advance transaction
    // amount in both the full-lookup and Shopify-only-confirmed paths (see
    // shopifyService.findCashfreePayment) — falls back to a 25% estimate
    // only if no Cashfree transaction was found on the order at all.
    const advance = cashfreePayment?.order_amount ?? grossTotal * 0.25;
    const balance = grossTotal - advance;
    const { captured, note: advanceNote } = cashfreeStatus();
    const balRemitted = Boolean(icarryRemit?.remittance_id);
    legs.push({
      name: "Advance (Prepaid)",
      amt: `${formatINR(advance)} gross`,
      val: formatINR(cashfreeSettlement?.settlement_amount ?? advance),
      cls: captured ? "g" : "a",
      tag: captured ? "confirmed" : "estimated",
      note: captured ? `${advanceNote} · already secured regardless of outcome` : advanceNote,
    });
    legs.push({
      name: "Balance (COD)",
      amt: `${formatINR(balance)} gross`,
      val: formatINR(balance),
      cls: balRemitted ? "g" : "a",
      tag: balRemitted ? "confirmed" : "estimated",
      note: balRemitted ? `Remitted · Batch #${icarryRemit.remittance_id}` : "Awaiting dispatch / delivery",
    });
  }

  if (shipCat === "rto") {
    const freight = icarryRemit?.rto_freight ?? null;
    legs.push({
      name: "RTO Freight (charged to you)",
      amt: "Return shipping cost",
      val: freight != null ? `-${formatINR(freight)}` : "TBD — pending iCarry wallet debit",
      cls: "r",
      tag: "confirmed",
      note: "Deducted from wallet on return scan",
    });
  }

  return legs;
}

// A handful of iCarry's documented NDR event codes, for a readable shipNote.
// Full list is in their API Document v17.0 — these are the common ones.
const NDR_DESCRIPTIONS = {
  "REATTEMPT-CONTACT": "Consignee unreachable / address unclear",
  REATTEMPT: "Delivery attempt failed",
  "REATTEMPT-COD-NOT-READY": "Consignee didn't have COD amount ready",
  "CONSIGNEE-OPENED-REFUSED": "Consignee opened and refused parcel",
  "REATTEMPT-CUST-REFUSED": "Consignee refused delivery",
  "REATTEMPT-NEW-DATE": "Consignee asked for a future delivery date",
  "REATTEMPT-OTP": "Consignee didn't have OTP to accept delivery",
  "URGENT-DELIVERY": "Delivery detected as beyond EDD",
};

/**
 * Merges one Shopify order with its matched Cashfree payment/settlement and
 * iCarry tracking/NDR data into the flat shape the dashboard UI renders.
 * Cashfree is joined via the order_id its Shopify integration stamps into
 * the order's transaction record (see shopifyService.findCashfreePayment).
 * iCarry is joined via a local shipment_id mapping (see
 * lib/icarryShipmentMap.js) since there's no documented way to resolve that
 * from a Shopify order directly.
 */
function mapOrder({ shopifyOrder, cashfreePayment, cashfreeSettlement, icarryTracking, icarryRemit, icarryNdr }) {
  const orderType = classifyOrderType(shopifyOrder);
  const grossTotal = Number(shopifyOrder.current_total_price ?? shopifyOrder.total_price ?? 0);
  // Real iCarry TRACK response's `status` is a human string like "Delivered"
  // or "Manifested" (confirmed against their API Document v17.0), not a code.
  let shipCat = shopifyOrder.cancelled_at
    ? "cancelled"
    : icarryTracking?.status
    ? mapTrackingStatus(icarryTracking.status)
    : "unful";

  // NDR isn't part of TRACK's status vocabulary — it's a separate signal
  // from iCarry's NDR webhook. Layer it on top unless the shipment has
  // already reached a terminal state (delivered/RTO'd/cancelled), in which
  // case the NDR is moot and TRACK's own status wins.
  if (icarryNdr && !["delivered", "rto", "cancelled"].includes(shipCat)) {
    shipCat = "ndr";
  }

  const legs = buildLegs({ orderType, grossTotal, cashfreePayment, cashfreeSettlement, icarryRemit, shipCat });

  const netLoss = shipCat === "rto"
    ? legs.filter((l) => l.cls === "r").reduce((sum, l) => sum + parseFloat(l.val.replace(/[₹,]/g, "")), 0)
    : null;

  return {
    id: shopifyOrder.name,
    date: shopifyOrder.created_at,
    customer: customerName(shopifyOrder),
    loc: customerLocation(shopifyOrder),
    type: orderType,
    items: itemsSummary(shopifyOrder),
    shipCat,
    shipLabel: SHIP_LABELS[shipCat] || shipCat,
    shipNote: shipCat === "ndr" ? NDR_DESCRIPTIONS[icarryNdr.type] || icarryNdr.type : shipNoteFrom(icarryTracking),
    // Real TRACK response has no awb/tracking_url field to build a working
    // link from (confirmed against iCarry's API doc) — we know the status,
    // just can't offer a clickable tracking link yet.
    track: Boolean(icarryTracking?.status),
    trackingUrl: null,
    sync: cashfreePayment && icarryTracking ? "paid+tracking" : icarryTracking ? "tracking" : "none",
    wa: null, // WhatsApp alerting isn't one of the three source systems — see README "Alerts" section
    legs,
    net:
      netLoss != null
        ? { pos: netLoss >= 0, label: netLoss >= 0 ? "Net position on this order" : "Net loss on this order", val: formatINR(netLoss) }
        : null,
  };
}

module.exports = { mapOrder, classifyOrderType };
