const { formatINR } = require("../lib/money");

// Deterministic PRNG (mulberry32) so mock data is stable across restarts —
// makes it easy to eyeball the UI without the dataset reshuffling on reload.
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(42);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const int = (min, max) => Math.floor(rand() * (max - min + 1)) + min;

const NAMES = [
  "Priya Malhotra", "Divya Patel", "Vishal Akhtar", "Sanjay Reddy", "Ashish Shah",
  "Simran Chauhan", "Meera Verma", "Shreya Kaur", "Sneha Joshi", "Richa Reddy",
  "Suresh Rao", "Rohan Kapoor", "Kavya Pillai", "Manoj Kapoor", "Farhan Mishra",
  "Gaurav Patel", "Harsh Kumar", "Sameer Iyer", "Nikhil Iyer", "Sonal Hegde",
];
const CITIES = [
  ["Kochi", "KL"], ["Delhi", "DL"], ["Lucknow", "UP"], ["Pune", "MH"], ["Vizag", "AP"],
  ["Bengaluru", "KA"], ["Guwahati", "AS"], ["Vadodara", "GJ"], ["Kolkata", "WB"], ["Patna", "BR"],
  ["Chandigarh", "PB"], ["Indore", "MP"], ["Agra", "UP"], ["Nagpur", "MH"], ["Hyderabad", "TS"],
  ["Coimbatore", "TN"], ["Ranchi", "JH"], ["Ahmedabad", "GJ"], ["Srinagar", "JK"], ["Jaipur", "RJ"],
];
const PRODUCTS = [
  "Race Hoodie · Black", "Oversized Tee · White", "Track Shorts · Grey",
  "Podium Sweatshirt · Charcoal", "Pit Crew Cap · One Size", "Racing Jacket · Black",
];
const SIZES = ["S", "M", "L", "XL", "XXL"];
const COURIERS = ["Delhivery", "DTDC", "Bluedart", "Ekart", "Shadowfax", "Xpressbees"];
const SHIP_CATS = ["delivered", "delivered", "delivered", "transit", "unful", "ndr", "rto", "cancelled"];

function buildOrder(i) {
  const num = 5001 + i;
  const type = pick(["prepaid", "prepaid", "cod", "cod", "partial", "partial"]);
  const gross = int(6, 50) * 100 - 1;
  const shipCat = pick(SHIP_CATS);
  const courier = pick(COURIERS);
  const [city, state] = pick(CITIES);
  const legs = [];
  let wa = null;
  let net = null;

  const settled = shipCat === "delivered" || rand() > 0.4;

  if (type === "prepaid") {
    const fee = +(gross * 0.018).toFixed(2);
    legs.push({
      name: "Prepaid — Full Order",
      amt: `${formatINR(gross)} gross · −${formatINR(fee)} PG fee`,
      val: formatINR(gross - fee),
      cls: settled ? "g" : "a",
      tag: settled ? "confirmed" : "estimated",
      note: settled ? "Settled to bank · Batch #CF-" + int(88000, 89999) : "Expected settlement · Cashfree T+2 cycle",
    });
  } else if (type === "cod") {
    const fee = +(gross * 0.02).toFixed(2);
    legs.push({
      name: "COD — Full Order",
      amt: `${formatINR(gross)} gross · −${formatINR(fee)} courier fee`,
      val: formatINR(gross - fee),
      cls: settled ? "g" : "a",
      tag: settled ? "confirmed" : "estimated",
      note: settled ? "Remitted · Batch #IC-" + int(4000, 4999) : "Expected remittance · iCarry cycle",
    });
  } else {
    const advance = +(gross * 0.25).toFixed(2);
    const balance = +(gross - advance).toFixed(2);
    const advFee = +(advance * 0.018).toFixed(2);
    legs.push({
      name: "Advance (Prepaid)",
      amt: `${formatINR(advance)} gross · −${formatINR(advFee)} PG fee`,
      val: formatINR(advance - advFee),
      cls: "g",
      tag: "confirmed",
      note: "Settled · Batch #CF-" + int(88000, 89999),
    });
    legs.push({
      name: "Balance (COD)",
      amt: `${formatINR(balance)} gross`,
      val: formatINR(balance),
      cls: settled ? "g" : "a",
      tag: settled ? "confirmed" : "estimated",
      note: settled ? "Remitted · Batch #IC-" + int(4000, 4999) : "Awaiting dispatch",
    });
  }

  if (shipCat === "rto") {
    const freight = int(90, 180);
    legs.push({
      name: "RTO Freight (charged to you)",
      amt: "Return shipping cost",
      val: `-${formatINR(freight)}`,
      cls: "r",
      tag: "confirmed",
      note: "Deducted from wallet on return scan",
    });
    net = { pos: false, label: "Net loss on this order", val: `-${formatINR(freight)}` };
    wa = `Sent — "#${num} refused by customer, RTO in transit."`;
  }
  if (shipCat === "ndr") {
    wa = `Sent — "NDR on #${num}: customer unavailable, re-attempt scheduled."`;
  }
  if (shipCat === "unful") {
    wa = rand() > 0.5 ? `Sent — "Order #${num} not dispatched in ${int(24, 60)} hrs. Check stock."` : null;
  }

  const daysAgo = 20 - Math.floor(i / 5);
  const date = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();

  return {
    id: `#${num}`,
    date,
    customer: pick(NAMES),
    loc: `${city}, ${state}`,
    type,
    items: `${pick(PRODUCTS)} · ${pick(SIZES)}`,
    shipCat,
    shipLabel: {
      delivered: "Delivered",
      transit: "In-Transit",
      rto: "RTO — Refused",
      ndr: "NDR — Action Needed",
      unful: `Not Dispatched · ${int(6, 60)} hrs`,
      cancelled: "Cancelled by Merchant",
    }[shipCat],
    shipNote: shipCat === "delivered" || shipCat === "transit" ? `${shipCat === "transit" ? "EDD +3d" : "Delivered"} · ${courier}` : shipCat === "unful" ? "Stock shortage flagged" : "",
    track: shipCat === "delivered" || shipCat === "transit" || shipCat === "ndr",
    sync: shipCat === "unful" || shipCat === "cancelled" ? "none" : settled ? "paid+tracking" : "tracking",
    wa,
    legs,
    net,
  };
}

const mockOrders = Array.from({ length: 100 }, (_, i) => buildOrder(i));

module.exports = { mockOrders };
