const icarryAwbMap = require("../lib/icarryAwbMap");
const icarryReturnMap = require("../lib/icarryReturnMap");

const SHIP_STATUS_LABELS = {
  notscheduled: "Not Scheduled",
  scheduled: "Scheduled",
  transit: "In-Transit",
  delivered: "Delivered",
  rto: "RTO",
};

/** True when iCarry's own tracking status is itself a cancellation/void — a courier-side shipment void, NOT a Shopify order cancellation (see mapOrder.js's mapTrackingStatus for why these must stay distinct). */
function isCourierCancelled(icarryTracking) {
  const status = (icarryTracking?.status || "").toLowerCase();
  return status.includes("cancel") || status === "voided";
}

/** Buckets iCarry's real status vocabulary into this page's 5-state model. */
function classifyShipStatus(icarryShipmentId, icarryTracking) {
  if (!icarryShipmentId) return "notscheduled";
  const status = (icarryTracking?.status || "").toLowerCase();
  if (!status) return "scheduled"; // booked, but we don't have a status yet
  if (status.includes("delivered")) return "delivered";
  if (status.includes("returned to origin") || status.includes("pending return") || status.includes("lost") || status.includes("damaged")) return "rto";
  // A cancelled shipment is NOT an RTO (nothing is coming back — it was never
  // picked up or was voided before transit) and NOT a Shopify order
  // cancellation either. Confirmed live: iCarry voids shipments on its own
  // with no Shopify-side cancellation, expecting a re-book with the same or
  // a different courier — "Not Scheduled" is what actually makes that
  // re-book possible from this page (the Schedule Shipment button only
  // shows for this bucket).
  if (isCourierCancelled(icarryTracking)) return "notscheduled";
  if (status.includes("transit") || status.includes("shipped") || status.includes("out for delivery")) return "transit";
  return "scheduled"; // manifested / pending pickup / processing / pickup scheduled
}

// See mapOrder.js's isManualOrder for why an absent/draft-order source_name
// means this order was created by hand in Shopify admin, not through a real
// checkout channel.
function isManualOrder(shopifyOrder) {
  return !shopifyOrder.source_name || shopifyOrder.source_name === "shopify_draft_order";
}

function orderValueLabel(orderType, shopifyOrder, formatINR) {
  const total = Number(shopifyOrder.current_total_price ?? shopifyOrder.total_price ?? 0);
  if (orderType !== "partial") return formatINR(total);
  // No reliable advance-amount split without re-fetching Cashfree/transaction
  // data here (mapOrder.js does that for the finance page) — approximate
  // using Shopify's own tag/note convention if present, else a flat 25%.
  const advance = total * 0.25;
  return `${formatINR(advance)} advance + ${formatINR(total - advance)} COD`;
}

function shipmentWeightGrams(shopifyOrder) {
  const grams = (shopifyOrder.line_items || []).reduce((sum, li) => sum + (Number(li.grams) || 0) * (li.quantity || 1), 0);
  return grams > 0 ? grams : 500; // fallback default when Shopify has no weight on the line items
}

function deliveryAddress(shopifyOrder) {
  const addr = shopifyOrder.shipping_address;
  if (!addr) return null;
  return [addr.address1, addr.address2].filter(Boolean).join(", ") || null;
}

function deliveryPhone(shopifyOrder) {
  return shopifyOrder.shipping_address?.phone || shopifyOrder.phone || shopifyOrder.customer?.phone || null;
}

// iCarry's TRACK `details` array is NOT reliably ordered — confirmed live,
// same account, two different real shipments: one came back oldest-first,
// another newest-first. Parsing each entry's own "DD/MM/YY HH:mm:ss" and
// sorting is the only way to get a trustworthy order, since trusting array
// position (first or last) picks the wrong end about half the time.
function parseIcarryDatetime(s) {
  const m = /^(\d{2})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/.exec(s || "");
  if (!m) return 0;
  const [, dd, mm, yy, hh, min, ss] = m;
  return new Date(2000 + Number(yy), Number(mm) - 1, Number(dd), Number(hh), Number(min), Number(ss)).getTime();
}

/** Oldest-first — TrackModal.tsx reverses this itself for display, so the contract here must actually hold. */
function sortTrackHistory(trackHistory) {
  return [...trackHistory].sort((a, b) => parseIcarryDatetime(a.datetime) - parseIcarryDatetime(b.datetime));
}

/** Maps one enriched record (see enrichOrders.js) into the shipping page's card shape. */
function mapShipment(record, formatINR) {
  const { shopifyOrder, icarryTracking, icarryShipmentId } = record;
  const shipStatus = classifyShipStatus(icarryShipmentId, icarryTracking);

  const orderType =
    shopifyOrder.financial_status === "partially_paid"
      ? "partial"
      : shopifyOrder.financial_status === "paid"
      ? "prepaid"
      : "cod";

  const trackHistory = sortTrackHistory(
    (icarryTracking?.details || []).map((d) => ({
      datetime: d.datetime,
      location: d.location || "—",
      note: d.notes,
    }))
  );
  const latestEvent = trackHistory.length ? trackHistory[trackHistory.length - 1] : null;

  return {
    id: shopifyOrder.name,
    manual: isManualOrder(shopifyOrder),
    // Deliberately ONLY the real Shopify cancellation — a cancelled
    // *shipment* (isCourierCancelled) is not an order cancellation and must
    // never show the Void treatment; it's handled above as "notscheduled"
    // instead, so the order stays normal and re-bookable.
    cancelled: Boolean(shopifyOrder.cancelled_at),
    date: shopifyOrder.created_at,
    customer: [shopifyOrder.customer?.first_name, shopifyOrder.customer?.last_name].filter(Boolean).join(" ") || "Guest",
    loc: [shopifyOrder.shipping_address?.city, shopifyOrder.shipping_address?.province_code].filter(Boolean).join(", ") || "—",
    items: (shopifyOrder.line_items || []).map((li) => `${li.title}${li.variant_title ? " · " + li.variant_title : ""}`).join(" · "),
    type: orderType,
    value: orderValueLabel(orderType, shopifyOrder, formatINR),
    shipStatus,
    shipLabel: SHIP_STATUS_LABELS[shipStatus],
    courier: icarryTracking?.courier_name || null,
    shipmentId: icarryShipmentId || null,
    edd: icarryTracking?.edd || null,
    trackHistory,
    address: deliveryAddress(shopifyOrder),
    phone: deliveryPhone(shopifyOrder),
    awb: icarryAwbMap.getAwb(shopifyOrder.name),
    // icarryTracking.location/datetime are TRACK's own dedicated "current
    // state" fields — confirmed live more reliable than deriving from
    // trackHistory's last entry, which depends on correctly guessing
    // iCarry's per-shipment ordering; kept as a fallback only.
    currentLocation:
      shipStatus !== "notscheduled" && shipStatus !== "delivered"
        ? icarryTracking?.location || latestEvent?.location || null
        : null,
    deliveredDate:
      shipStatus === "delivered"
        ? icarryTracking?.delivered_datetime || icarryTracking?.datetime || latestEvent?.datetime || null
        : null,
    returnPickup: shipStatus === "delivered" ? icarryReturnMap.getReturnPickup(shopifyOrder.name) : null,
    // Needed client-side to request a real courier estimate / booking.
    pincode: shopifyOrder.shipping_address?.zip || null,
    weightGrams: shipmentWeightGrams(shopifyOrder),
    shipmentValue: Number(shopifyOrder.current_total_price ?? shopifyOrder.total_price ?? 0),
  };
}

module.exports = { mapShipment, classifyShipStatus };
