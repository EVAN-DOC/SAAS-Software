const axios = require("axios");
const config = require("../config");

/**
 * iCarry (icarry.in) does not publish a public API reference — access is
 * granted per-merchant via their panel (Settings > API) or by emailing
 * support, and the exact paths/payloads vary by the plan you're on.
 *
 * The endpoints below follow the shape iCarry describes on their API
 * plugins page (Book Shipment, Track a Shipment, Sync Shipment Status) but
 * are NOT verified against a live account. Before going live:
 *   1. Pull the real request/response contract from your iCarry dashboard
 *      or their support team.
 *   2. Update ICARRY_BASE_URL and the paths/auth below to match.
 *   3. Adjust mapTrackingStatus() so their status strings map to this
 *      dashboard's shipCat buckets.
 *
 * Auth: this account was issued an API Username + API Key (no secret/
 * signature). iCarry doesn't document how those two are sent, so this
 * client sends them as `username` / `api_key` query params on every
 * request — the most common pattern for this class of Indian courier
 * aggregator API. If iCarry's actual docs say otherwise (e.g. they belong
 * in the JSON body, or as headers), move the two lines in withAuth() below
 * accordingly — everything else in this file stays the same.
 */

function client() {
  const { baseUrl, username, apiKey } = config.icarry;
  if (!username || !apiKey) {
    throw new Error(
      "iCarry is not configured — set ICARRY_API_USERNAME and ICARRY_API_KEY, or set MOCK_MODE=true"
    );
  }
  return axios.create({
    baseURL: baseUrl,
    headers: { "Content-Type": "application/json" },
    timeout: 15000,
  });
}

/** Merges the iCarry username/api_key into a request's query params. */
function withAuth(params = {}) {
  const { username, apiKey } = config.icarry;
  return { username, api_key: apiKey, ...params };
}

/** Track a single shipment by AWB / order reference. TODO: confirm path with iCarry. */
async function trackShipment(referenceOrAwb) {
  const http = client();
  const res = await http.get("/v1/track", { params: withAuth({ reference: referenceOrAwb }) });
  return res.data;
}

/** Bulk status sync for shipments updated since a given time. TODO: confirm path with iCarry. */
async function syncShipmentStatuses(sinceIso) {
  const http = client();
  const res = await http.get("/v1/shipments/sync", { params: withAuth({ updated_since: sinceIso }) });
  return res.data;
}

/**
 * COD remittance / wallet ledger — needed for the RTO freight deduction and
 * COD remittance batch numbers shown in the dashboard's money breakdown.
 * TODO: confirm path/fields with iCarry; this is a best guess at the shape.
 */
async function fetchRemittances({ startDate, endDate } = {}) {
  const http = client();
  const res = await http.get("/v1/remittances", { params: withAuth({ start_date: startDate, end_date: endDate }) });
  return res.data;
}

/**
 * Normalizes iCarry's raw status string into the dashboard's shipCat buckets:
 * delivered | transit | rto | ndr | unful | cancelled.
 * Adjust the string matches once you see real values from iCarry's payload.
 */
function mapTrackingStatus(rawStatus = "") {
  const s = rawStatus.toLowerCase();
  if (s.includes("delivered")) return "delivered";
  if (s.includes("rto") || s.includes("return")) return "rto";
  if (s.includes("ndr") || s.includes("undelivered") || s.includes("failed attempt")) return "ndr";
  if (s.includes("cancel")) return "cancelled";
  if (s.includes("transit") || s.includes("shipped") || s.includes("out for delivery")) return "transit";
  return "unful";
}

module.exports = { trackShipment, syncShipmentStatuses, fetchRemittances, mapTrackingStatus };
