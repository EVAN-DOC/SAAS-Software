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

  // icarryRemit is the real "COD REMITTANCE" response shape (confirmed live,
  // not in iCarry's API Document v17.0 — see icarryService.getRemittanceDetail):
  // { paid, paid_date, reference, payout_id, is_delivered }. There is no
  // courier-fee or per-shipment freight field in this response — iCarry's
  // separate "SYNC Shipment CHARGES" endpoint (icarryService.syncShipmentCharges,
  // `miles` field) is the closest verified source for that if it's ever wired in.
  function icarryRemitStatus(notYetNote) {
    const remitted = Boolean(icarryRemit?.paid);
    const note = remitted
      ? ["Remitted", icarryRemit.paid_date && `on ${icarryRemit.paid_date}`, icarryRemit.reference && `· Ref ${icarryRemit.reference}`]
          .filter(Boolean)
          .join(" ")
      : icarryRemit?.is_delivered
      ? "Delivered — awaiting iCarry COD remittance"
      : notYetNote;
    return { remitted, note };
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
    const { remitted, note } = icarryRemitStatus("Expected remittance per iCarry COD cycle");
    legs.push({
      name: "COD — Full Order",
      amt: `${formatINR(grossTotal)} gross`,
      val: formatINR(grossTotal),
      cls: remitted ? "g" : "a",
      tag: remitted ? "confirmed" : "estimated",
      note,
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
    const { remitted: balRemitted, note: balNote } = icarryRemitStatus("Awaiting dispatch / delivery");
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
      note: balNote,
    });
  }

  if (shipCat === "rto") {
    // No verified iCarry endpoint yet returns the actual per-shipment RTO
    // freight amount (see icarryRemitStatus's comment above) — shown as TBD
    // rather than a fabricated number until one is wired in.
    legs.push({
      name: "RTO Freight (charged to you)",
      amt: "Return shipping cost",
      val: "TBD — pending iCarry wallet debit",
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
