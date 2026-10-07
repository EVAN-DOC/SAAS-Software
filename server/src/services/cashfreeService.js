const axios = require("axios");
const config = require("../config");

function client() {
  const { env, clientId, clientSecret, apiVersion } = config.cashfree;
  if (!clientId || !clientSecret) {
    throw new Error(
      "Cashfree is not configured — set CASHFREE_CLIENT_ID and CASHFREE_CLIENT_SECRET, or set MOCK_MODE=true"
    );
  }
  const baseURL =
    env === "production" ? "https://api.cashfree.com/pg" : "https://sandbox.cashfree.com/pg";
  return axios.create({
    baseURL,
    headers: {
      "x-client-id": clientId,
      "x-client-secret": clientSecret,
      "x-api-version": apiVersion,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    timeout: 15000,
  });
}

/**
 * Payments made against a Cashfree order. `order_id` is whatever you passed
 * when creating the Cashfree order — wire this to your Shopify order name/id
 * at checkout time so the two systems share a key.
 * https://www.cashfree.com/docs/api-reference/payments/latest/orders/fetch-payments-for-an-order
 */
async function fetchPaymentsForOrder(cashfreeOrderId) {
  const http = client();
  const res = await http.get(`/orders/${encodeURIComponent(cashfreeOrderId)}/payments`);
  return res.data; // array of payment objects (amount, payment_group, bank_reference, ...)
}

/**
 * Per-order settlement/settlement-fee breakdown (v2023-08-01).
 * https://www.cashfree.com/docs/api-reference/payments/previous/v2023-08-01/settlements/settlements-for-order
 */
async function fetchSettlementsForOrder(cashfreeOrderId) {
  const http = client();
  const res = await http.get(`/orders/${encodeURIComponent(cashfreeOrderId)}/settlements`);
  return res.data;
}

/**
 * Bulk settlement reconciliation across a date range — cheaper than calling
 * fetchSettlementsForOrder per order when reconciling a whole batch, and
 * critically, the ONLY way to get real settlement proof for an order whose
 * Cashfree order_id can't be resolved (see findCashfreeSettlementByPaymentId
 * below). Confirmed live — the request shape is picky and not obviously
 * documented from the field names alone:
 *   - start_date/end_date must be full ISO 8601 datetimes (date-only is
 *     rejected with "order_expiry_time_invalid", a misleading error name).
 *   - Both must be nested under a top-level `filters` object, not sent bare.
 *   - `pagination.limit` is required even for a small, targeted lookup.
 * https://www.cashfree.com/docs/api-reference/payments/latest/settlements/settlement-reconciliation
 */
async function fetchSettlementRecon({ startDate, endDate, cfPaymentIds, cursor, limit = 50 } = {}) {
  const http = client();
  const res = await http.post("/settlement/recon", {
    filters: {
      start_date: startDate,
      end_date: endDate,
      ...(cfPaymentIds ? { cf_payment_ids: cfPaymentIds } : {}),
    },
    pagination: { limit, ...(cursor ? { cursor } : {}) },
  });
  return res.data; // { cursor, limit, data: [...] }
}

/**
 * Real settlement proof for a payment when there's no Cashfree order_id to
 * query directly — the Partial-COD advance path (see enrichOrders.js):
 * Shopify's transaction record only gives a Shopify-generated label there,
 * not Cashfree's order_id, so fetchSettlementsForOrder can't be used at all.
 * Returns a settlement-shaped object matching fetchSettlementsForOrder's
 * fields (transfer_utr, settlement_amount) so callers don't need to know
 * which path produced it — null if genuinely not settled yet.
 *
 * IMPORTANT: confirmed live that Cashfree's own `cf_payment_ids` request
 * filter is silently ignored — it still returns every settlement in the
 * date range regardless. The filter is still sent (harmless, and might
 * start working), but the actual match against cf_payment_id has to happen
 * here, client-side, against the full returned list, or this would return
 * someone else's settlement for every payment (confirmed this actually
 * happened during testing — do not remove this filter).
 */
async function findSettlementByPaymentId(cfPaymentId, { lookbackDays = 30 } = {}) {
  const end = new Date();
  const start = new Date(end.getTime() - lookbackDays * 24 * 60 * 60 * 1000);
  const iso = (d) => d.toISOString().replace(/\.\d{3}Z$/, "+00:00");
  const result = await fetchSettlementRecon({ startDate: iso(start), endDate: iso(end), cfPaymentIds: [String(cfPaymentId)], limit: 200 });
  const hit = result?.data?.find((r) => r.cf_payment_id === String(cfPaymentId) && r.settlement_utr);
  if (!hit) return null;
  return {
    transfer_utr: hit.settlement_utr,
    settlement_amount: hit.event_settlement_amount,
    settlement_date: hit.settlement_date,
  };
}

module.exports = { fetchPaymentsForOrder, fetchSettlementsForOrder, fetchSettlementRecon, findSettlementByPaymentId };
