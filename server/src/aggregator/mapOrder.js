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
 * Shopify has no native "partial COD" order type — Indian D2C stores that
 * take a prepaid advance + COD balance usually implement it with a checkout
 * app that tags the order (e.g. "partial-cod") and stores the advance amount
 * in note_attributes or a metafield. Adjust TAG / the note_attributes key
 * below to match whatever partial-COD app this store actually uses.
 */
function classifyOrderType(shopifyOrder) {
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

  if (orderType === "prepaid") {
    const fee = cashfreeSettlement?.settlement_amount != null
      ? grossTotal - cashfreeSettlement.settlement_amount
      : null;
    const settled = Boolean(cashfreeSettlement?.settlement_utr);
    legs.push({
      name: "Prepaid — Full Order",
      amt: fee != null
        ? `${formatINR(grossTotal)} gross · −${formatINR(fee)} PG fee`
        : `${formatINR(grossTotal)} gross`,
      val: formatINR(cashfreeSettlement?.settlement_amount ?? grossTotal),
      cls: settled ? "g" : "a",
      tag: settled ? "confirmed" : "estimated",
      note: settled
        ? `Settled to bank · UTR ${cashfreeSettlement.settlement_utr}`
        : "Expected settlement per Cashfree T+2 cycle",
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
    const advance = cashfreePayment?.order_amount ?? grossTotal * 0.25;
    const balance = grossTotal - advance;
    const advSettled = Boolean(cashfreeSettlement?.settlement_utr);
    const balRemitted = Boolean(icarryRemit?.remittance_id);
    legs.push({
      name: "Advance (Prepaid)",
      amt: `${formatINR(advance)} gross`,
      val: formatINR(cashfreeSettlement?.settlement_amount ?? advance),
      cls: advSettled ? "g" : "a",
      tag: advSettled ? "confirmed" : "estimated",
      note: advSettled ? "Settled · already secured regardless of outcome" : "Expected settlement soon",
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

/**
 * Merges one Shopify order with its matched Cashfree payment/settlement and
 * iCarry tracking/remittance record into the flat shape the dashboard UI
 * renders. All three systems are joined on the Shopify order name (e.g.
 * "#5001") — wire that as the reference/order_id when creating the Cashfree
 * order and the iCarry shipment at checkout/fulfillment time.
 */
function mapOrder({ shopifyOrder, cashfreePayment, cashfreeSettlement, icarryTracking, icarryRemit }) {
  const orderType = classifyOrderType(shopifyOrder);
  const grossTotal = Number(shopifyOrder.current_total_price ?? shopifyOrder.total_price ?? 0);
  const rawStatus = icarryTracking?.status || (shopifyOrder.fulfillment_status ? "shipped" : "");
  const shipCat = shopifyOrder.cancelled_at
    ? "cancelled"
    : icarryTracking
    ? mapTrackingStatus(rawStatus)
    : "unful";

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
    shipNote: icarryTracking?.status_detail || icarryTracking?.status || "Awaiting courier update",
    track: Boolean(icarryTracking?.awb),
    trackingUrl: icarryTracking?.tracking_url || null,
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
