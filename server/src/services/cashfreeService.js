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
 * fetchSettlementsForOrder per order when reconciling a whole batch.
 * https://www.cashfree.com/docs/api-reference/payments/latest/settlements/settlement-reconciliation
 */
async function fetchSettlementRecon({ startDate, endDate, cursor } = {}) {
  const http = client();
  const res = await http.post("/settlement/recon", {
    start_date: startDate,
    end_date: endDate,
    cursor,
  });
  return res.data; // { cursor, limit, data: [...] }
}

module.exports = { fetchPaymentsForOrder, fetchSettlementsForOrder, fetchSettlementRecon };
