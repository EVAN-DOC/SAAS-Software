const axios = require("axios");
const config = require("../config");

/**
 * Implements iCarry.in API Document v17.0 (obtained directly from iCarry,
 * https://www.icarry.in/icarry-api.pdf). Base URL and auth flow below are
 * verified against that document — not guessed.
 *
 * Auth: POST username+key to /api_login, get back an api_token valid for 60
 * minutes. That token is then appended as `&api_token=<token>` directly onto
 * every subsequent endpoint URL (yes, literally `&` with no leading `?` —
 * that's what iCarry's own docs show, so it's reproduced as-is here rather
 * than "corrected").
 *
 * KNOWN GAP: TRACK / SYNC STATUS / SYNC CHARGES all require iCarry's own
 * `shipment_id` — there is no documented endpoint to look that up from a
 * Shopify order number or AWB. For this store, iCarry's own Shopify
 * connector doesn't write tracking info back onto Shopify fulfillments
 * either (checked directly — fulfillments have no tracking_company/url), so
 * there's currently no automated way to resolve shipment_id for orders
 * synced via that connector. Two ways to close this:
 *   1. Register the "Webhook URL to get Shipment Status" (Account >
 *      Integrations > API Credentials in iCarry's panel) pointing at this
 *      server's /webhooks/icarry/status once it has a public URL — iCarry
 *      pushes {shipment_id, awb, client_order_id, status} on every change,
 *      which lets this app build its own shipment_id lookup over time.
 *   2. For historical backfill, check iCarry's panel (My Account -> My
 *      Shipments) for a CSV/export option covering shipment_id + AWB +
 *      client order reference, and import it once.
 */

const BASE_URL = "https://www.icarry.in";
const TOKEN_TTL_MS = 55 * 60 * 1000; // docs say 60 min; refresh a little early

let cachedToken = null;
let tokenExpiresAt = 0;

function http() {
  return axios.create({ baseURL: BASE_URL, timeout: 15000 });
}

// This is an OpenCart-based PHP backend — it reads $_POST, which needs a
// form-encoded body, not a JSON one (confirmed live: JSON bodies silently
// failed to deliver field values server-side, e.g. every shipment_id came
// back "not found" including ones taken straight from iCarry's own export).
function toFormBody(obj, prefix = "") {
  const params = new URLSearchParams();
  const add = (key, value) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      value.forEach((v, i) => add(`${key}[${i}]`, v));
    } else if (typeof value === "object") {
      Object.entries(value).forEach(([k, v]) => add(`${key}[${k}]`, v));
    } else {
      params.append(key, value);
    }
  };
  Object.entries(obj).forEach(([k, v]) => add(prefix ? `${prefix}[${k}]` : k, v));
  return params;
}

async function login() {
  const { username, apiKey } = config.icarry;
  if (!username || !apiKey) {
    throw new Error("iCarry is not configured — set ICARRY_API_USERNAME and ICARRY_API_KEY, or set MOCK_MODE=true");
  }
  const res = await http().post("/api_login", toFormBody({ username, key: apiKey }));
  if (!res.data?.api_token) {
    throw new Error(`iCarry login failed: ${JSON.stringify(res.data?.error || res.data)}`);
  }
  cachedToken = res.data.api_token;
  tokenExpiresAt = Date.now() + TOKEN_TTL_MS;
  return cachedToken;
}

async function getToken() {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;
  return login();
}

/** iCarry's docs literally show `&api_token=` with no `?` — reproduced as-is. */
// iCarry's server sometimes leaks a PHP notice/warning into the response
// body ahead of the actual JSON (confirmed live — a bug on their end, not
// worth working around any way other than parsing past it). Extract the
// last {...} in the string if the body isn't already valid JSON.
function parseIcarryResponse(data) {
  if (typeof data !== "string") return data;
  try {
    return JSON.parse(data);
  } catch {
    const match = data.match(/\{[\s\S]*\}\s*$/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        // fall through
      }
    }
    return { error: data };
  }
}

async function post(path, body) {
  const token = await getToken();
  const formBody = toFormBody(body);
  try {
    const res = await http().post(`${path}&api_token=${token}`, formBody);
    return parseIcarryResponse(res.data);
  } catch (err) {
    // Token may have been invalidated server-side before our TTL guess; retry once with a fresh one.
    if (err.response?.status === 401 || err.response?.data?.error?.key) {
      cachedToken = null;
      const freshToken = await getToken();
      const res = await http().post(`${path}&api_token=${freshToken}`, formBody);
      return parseIcarryResponse(res.data);
    }
    throw err;
  }
}

/** TRACK a Shipment — requires iCarry's own shipment_id (see module doc comment for the current gap). */
async function trackShipment(shipmentId) {
  return post("/api_track_shipment", { shipment_id: shipmentId });
}

/** SYNC Shipment STATUS for multiple shipments at once — cheaper than tracking one by one. */
async function syncShipmentStatuses(shipmentIds) {
  return post("/api_shipment_status_sync", { shipment_ids: shipmentIds });
}

/** SYNC Shipment CHARGES — actual billed freight cost per shipment (field is called `miles` in iCarry's response despite being a currency amount). */
async function syncShipmentCharges(shipmentIds) {
  return post("/api_shipment_billing_sync", { shipment_ids: shipmentIds });
}

async function checkPincode(pincode) {
  return post("/api_check_pincode", { pincode });
}

/**
 * Get ESTIMATE Single Shipment — real courier options + cost for a parcel.
 * Read-only, no side effects, safe to call freely (used to populate the
 * "choose a courier" step before booking).
 */
async function getEstimate({ lengthCm, breadthCm, heightCm, weightGrams, originPincode, destinationPincode, shipmentType, shipmentValue, mode = "S" }) {
  return post("/api_get_estimate", {
    length: lengthCm,
    breadth: breadthCm,
    height: heightCm,
    weight: weightGrams,
    destination_pincode: destinationPincode,
    origin_pincode: originPincode,
    destination_country_code: "IN",
    origin_country_code: "IN",
    shipment_mode: mode,
    shipment_type: shipmentType, // 'C' (COD) | 'P' (Prepaid)
    shipment_value: shipmentValue,
  });
}

/**
 * Book SINGLE Shipment — REAL, consequential action: creates an actual
 * shipment with a courier, schedules a pickup, and will incur real charges.
 * Not reversible via a simple "undo" (cancelShipment exists but RTO
 * freight may still apply once picked up). Requires a pickup_address_id
 * from your iCarry account (Settings > My Addresses > Pick up address) —
 * see config.icarry.pickupAddressId / ICARRY_PICKUP_ADDRESS_ID.
 */
async function bookShipment({ pickupAddressId, clientOrderId, courierId, consignee, parcel, mode = "surface" }) {
  const path = mode === "air" ? "/api_add_shipment_air" : "/api_add_shipment_surface";
  return post(path, {
    pickup_address_id: pickupAddressId,
    client_order_id: clientOrderId,
    courier_id: courierId,
    consignee,
    parcel,
  });
}

/** PRINT Shipment Label — read-only, retrieves the label for an already-booked shipment. */
async function printShipmentLabel(shipmentId, paperSize) {
  return post("/api_print_shipment_label", { shipment_id: shipmentId, paper_size: paperSize });
}

/**
 * REVERSE Shipment — books a reverse pickup for a shipment that has already
 * been delivered. REAL, consequential action (schedules a real pickup and
 * generates a new AWB for the return leg), same caution as bookShipment.
 */
async function reverseShipment(shipmentId) {
  return post("/api_add_reverse_shipment", { shipment_id: shipmentId });
}

// Numeric codes from SYNC Shipment STATUS's documented status table.
const NUMERIC_STATUS = {
  1: "Pending Pickup",
  2: "Processing",
  3: "Shipped",
  7: "Canceled",
  12: "Damaged",
  14: "Lost",
  16: "Voided",
  21: "Delivered",
  22: "In Transit",
  23: "Returned to Origin",
  24: "Manifested",
  25: "Pickup Scheduled",
  26: "Out For Delivery",
  27: "Pending Return",
};

/**
 * Normalizes iCarry's status (numeric code from SYNC, or string from TRACK)
 * into the dashboard's shipCat buckets: delivered | transit | rto | ndr |
 * unful | cancelled.
 */
function mapTrackingStatus(rawStatus) {
  const s = String(NUMERIC_STATUS[rawStatus] ?? rawStatus ?? "").toLowerCase();
  if (s.includes("delivered")) return "delivered";
  if (s.includes("returned to origin") || s.includes("pending return")) return "rto";
  if (s.includes("cancel") || s === "voided") return "cancelled";
  if (s.includes("lost") || s.includes("damaged")) return "rto";
  if (s.includes("transit") || s.includes("shipped") || s.includes("out for delivery")) return "transit";
  if (s.includes("pending pickup") || s.includes("processing") || s.includes("manifested") || s.includes("pickup scheduled")) return "unful";
  return "unful";
}

module.exports = {
  trackShipment,
  syncShipmentStatuses,
  syncShipmentCharges,
  checkPincode,
  getEstimate,
  bookShipment,
  printShipmentLabel,
  reverseShipment,
  mapTrackingStatus,
};
