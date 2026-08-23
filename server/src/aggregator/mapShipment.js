const icarryAwbMap = require("../lib/icarryAwbMap");

const SHIP_STATUS_LABELS = {
  notscheduled: "Not Scheduled",
  scheduled: "Scheduled",
  transit: "In-Transit",
  delivered: "Delivered",
  rto: "RTO",
};

/** Buckets iCarry's real status vocabulary into this page's 5-state model. */
function classifyShipStatus(icarryShipmentId, icarryTracking) {
  if (!icarryShipmentId) return "notscheduled";
  const status = (icarryTracking?.status || "").toLowerCase();
  if (!status) return "scheduled"; // booked, but we don't have a status yet
  if (status.includes("delivered")) return "delivered";
  if (status.includes("returned to origin") || status.includes("pending return") || status.includes("lost") || status.includes("damaged")) return "rto";
  if (status.includes("cancel") || status === "voided") return "rto"; // closest bucket in this page's fixed vocabulary
  if (status.includes("transit") || status.includes("shipped") || status.includes("out for delivery")) return "transit";
  return "scheduled"; // manifested / pending pickup / processing / pickup scheduled
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

/** Last known event, i.e. the most recent tracking update — iCarry's TRACK `details` array is chronological (oldest first). */
function latestTrackEvent(trackHistory) {
  return trackHistory.length ? trackHistory[trackHistory.length - 1] : null;
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

  const trackHistory = (icarryTracking?.details || []).map((d) => ({
    datetime: d.datetime,
    location: d.location || "—",
    note: d.notes,
  }));
  const latestEvent = latestTrackEvent(trackHistory);

  return {
    id: shopifyOrder.name,
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
    currentLocation: shipStatus !== "notscheduled" && shipStatus !== "delivered" ? latestEvent?.location || null : null,
    deliveredDate: shipStatus === "delivered" ? latestEvent?.datetime || null : null,
    // Needed client-side to request a real courier estimate / booking.
    pincode: shopifyOrder.shipping_address?.zip || null,
    weightGrams: shipmentWeightGrams(shopifyOrder),
    shipmentValue: Number(shopifyOrder.current_total_price ?? shopifyOrder.total_price ?? 0),
  };
}

module.exports = { mapShipment, classifyShipStatus };
