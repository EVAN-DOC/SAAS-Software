import { Order, OrderKpi, OrderLeg } from "./types";
import { fmt, numFromVal } from "./format";

// ---- Where a leg's money actually comes from ----
// Derived from the leg name mapOrder.js already uses — no backend change
// needed. "wallet" = RTO freight (iCarry debits your wallet), "pg" =
// Cashfree (prepaid/advance), "ship" = iCarry COD remittance.
export type LegSource = "pg" | "ship" | "wallet" | null;

export function legSource(name: string): LegSource {
  if (/RTO Freight/.test(name)) return "wallet";
  if (/Prepaid|Advance/.test(name)) return "pg";
  if (/COD/.test(name)) return "ship";
  return null;
}

// RTO freight is shown as "TBD — pending iCarry wallet debit" (see
// mapOrder.js) whenever there's no real per-shipment freight figure yet —
// which, right now, is always. numFromVal() would parse that string to NaN;
// treat it as "unknown amount", not zero and not a crash.
export function legAmount(leg: OrderLeg): number | null {
  const n = numFromVal(leg.val);
  return Number.isFinite(n) ? n : null;
}

export type Bucket = "bank" | "pg" | "ship" | "transit" | "unship" | "loss" | null;

export const BUCKET_LABEL: Record<Exclude<Bucket, null>, string> = {
  bank: "In bank",
  pg: "With Cashfree",
  ship: "With iCarry",
  transit: "COD on the road",
  unship: "COD not shipped yet",
  loss: "Freight lost",
};

export interface LegStatus {
  bucket: Bucket;
  text: string;
  via: string;
  /** For the strikethrough/void treatment on a leg that never collected anything. */
  void: boolean;
}

/** Real three-way tag (confirmed/pending/estimated) + cls, mapped onto a money bucket — no fabricated states. */
export function legStatus(leg: OrderLeg, order: Order): LegStatus {
  const src = legSource(leg.name);
  const amt = legAmount(leg);

  if (src === "wallet") return { bucket: "loss", text: "Freight lost", via: "iCarry wallet", void: false };
  if (leg.cls === "r" && (amt === 0 || amt === null)) return { bucket: null, text: "Never collected", via: "", void: true };
  if (order.shipCat === "cancelled" && leg.tag === "estimated") return { bucket: null, text: "Cancelled before collection", via: "", void: true };

  if (leg.tag === "confirmed" && leg.cls === "g") {
    return { bucket: "bank", text: "In bank", via: src === "pg" ? "Cashfree" : src === "ship" ? "iCarry" : "", void: false };
  }
  if (leg.tag === "pending") {
    return { bucket: "pg", text: "With Cashfree", via: "not in bank yet", void: false };
  }
  if (leg.tag === "estimated" && src === "pg") {
    return { bucket: "pg", text: "With Cashfree", via: "not captured yet", void: false };
  }
  if (leg.tag === "estimated" && src === "ship") {
    if (order.shipCat === "delivered") return { bucket: "ship", text: "With iCarry", via: "collected, not remitted", void: false };
    if (order.shipCat === "unful") return { bucket: "unship", text: "COD to collect", via: "not shipped", void: false };
    return { bucket: "transit", text: "COD to collect", via: order.shipCat === "ndr" ? "delivery failed" : "on the road", void: false };
  }
  return { bucket: null, text: leg.name, via: "", void: false };
}

// ---- Journey stage (visual Placed -> Shipped -> Delivered -> Paid out track) ----
export type StageKey = "unful" | "transit" | "ndr" | "rto" | "cancelled" | "payout" | "paid";

export interface Stage {
  key: StageKey;
  step: number; // -1 = void, 0..3 = track position
  label: string;
  bad: boolean;
  void: boolean;
  good: boolean;
  sub: string;
}

export function stageOf(order: Order): Stage {
  switch (order.shipCat) {
    case "unful":
      return { key: "unful", step: 0, label: "Not shipped", bad: false, void: false, good: false, sub: "" };
    case "transit":
      return { key: "transit", step: 1, label: "In transit", bad: false, void: false, good: false, sub: order.shipNote };
    case "ndr":
      return { key: "ndr", step: 1, label: "Delivery failed", bad: true, void: false, good: false, sub: order.shipNote };
    case "rto":
      return { key: "rto", step: 1, label: "Returned to you (RTO)", bad: true, void: false, good: false, sub: order.shipNote };
    case "cancelled":
      return { key: "cancelled", step: -1, label: "Cancelled", bad: false, void: true, good: false, sub: order.shipNote };
    case "delivered": {
      const pending = order.legs.some((l) => l.tag !== "confirmed" && (legAmount(l) ?? 0) > 0);
      return pending
        ? { key: "payout", step: 2, label: "Delivered · payout pending", bad: false, void: false, good: false, sub: order.shipNote }
        : { key: "paid", step: 3, label: "Paid out", bad: false, void: false, good: true, sub: order.shipNote };
    }
    default:
      return { key: "unful", step: 0, label: order.shipLabel, bad: false, void: false, good: false, sub: "" };
  }
}

// ---- Attention flag ----
export interface Attention {
  level: "red" | "amber" | "";
  text: string;
}

export function ageDays(dateIso: string): number {
  return Math.floor((Date.now() - new Date(dateIso).getTime()) / 86400000);
}

export function attentionOf(order: Order): Attention {
  const age = ageDays(order.date);
  if (order.shipCat === "unful") {
    const settled = order.legs.some((l) => legSource(l.name) === "pg" && l.tag !== "estimated");
    if (age > 3) return { level: "red", text: `Not shipped in ${age} days${settled ? " · already paid" : ""} — check stock or iCarry sync` };
    if (age >= 2) return { level: "amber", text: `Ship today — waiting ${age} days` };
    return { level: "", text: "Within dispatch window" };
  }
  if (order.shipCat === "ndr") return { level: "red", text: "Act now — re-attempt or call customer" };
  return { level: "", text: "" };
}

// ---- Order value (excludes freight, since that's a cost not a sale amount) ----
export function orderValue(order: Order): number {
  return order.legs.reduce((s, l) => {
    const amt = legAmount(l);
    return legSource(l.name) === "wallet" || amt === null ? s : s + amt;
  }, 0);
}

function uniqIds(pairs: { order: Order }[]): string[] {
  return [...new Set(pairs.map((p) => p.order.id))];
}

/**
 * Six KPI cards computed entirely from real, already-returned order/leg
 * data — no fabricated dates or amounts. Scoped to whatever `orders` the
 * caller already filtered by the page's single global date range (see
 * dateRange.ts) — there's no separate per-KPI date range (a deliberate
 * scope cut from the original mockup, which had one).
 */
export function computeOrderKpis(orders: Order[]): OrderKpi[] {
  const legPairs = orders.flatMap((order) => order.legs.map((leg) => ({ order, leg })));

  // 1. Settled to Bank
  const bankHits = legPairs.filter((p) => p.leg.tag === "confirmed" && p.leg.cls === "g" && (legAmount(p.leg) ?? 0) > 0);
  const bankPg = bankHits.filter((p) => legSource(p.leg.name) === "pg").reduce((s, p) => s + (legAmount(p.leg) ?? 0), 0);
  const bankShip = bankHits.filter((p) => legSource(p.leg.name) === "ship").reduce((s, p) => s + (legAmount(p.leg) ?? 0), 0);

  // 2. Pending from Cashfree — captured by Cashfree, not yet bank-settled (the real "pending" tag)
  const pgPendingHits = legPairs.filter((p) => p.leg.tag === "pending" && (legAmount(p.leg) ?? 0) > 0);
  const pgSafe = pgPendingHits.filter((p) => p.order.shipCat === "delivered").reduce((s, p) => s + (legAmount(p.leg) ?? 0), 0);
  const pgRisk = pgPendingHits.filter((p) => p.order.shipCat !== "delivered").reduce((s, p) => s + (legAmount(p.leg) ?? 0), 0);

  // 3. Pending from iCarry — delivered, COD collected, not yet remitted
  const shipPendingHits = legPairs.filter(
    (p) => p.leg.tag === "estimated" && legSource(p.leg.name) === "ship" && p.order.shipCat === "delivered" && (legAmount(p.leg) ?? 0) > 0
  );
  const shipPendingTotal = shipPendingHits.reduce((s, p) => s + (legAmount(p.leg) ?? 0), 0);

  // 4. In Transit (COD) — not money until delivered
  const transitHits = legPairs.filter(
    (p) =>
      p.leg.tag === "estimated" &&
      legSource(p.leg.name) === "ship" &&
      (p.order.shipCat === "transit" || p.order.shipCat === "ndr") &&
      (legAmount(p.leg) ?? 0) > 0
  );
  const onRoad = transitHits.filter((p) => p.order.shipCat === "transit");
  const ndr = transitHits.filter((p) => p.order.shipCat === "ndr");

  // 5. Not Dispatched
  const unfulOrders = orders.filter((o) => o.shipCat === "unful");
  const unfulCod = unfulOrders
    .flatMap((o) => o.legs.filter((l) => legSource(l.name) === "ship" && (legAmount(l) ?? 0) > 0))
    .reduce((s, l) => s + (legAmount(l) ?? 0), 0);
  const unfulPaid = unfulOrders
    .flatMap((o) => o.legs.filter((l) => legSource(l.name) === "pg" && (legAmount(l) ?? 0) > 0))
    .reduce((s, l) => s + (legAmount(l) ?? 0), 0);

  // 6. RTO — freight is honestly "TBD" in every real shipment right now (see
  // mapOrder.js), so no fabricated Net Impact figure — shown separately
  // instead of arithmetic'd together with a real "advances kept" number.
  const rtoOrders = orders.filter((o) => o.shipCat === "rto");
  const rtoFreightKnown = rtoOrders
    .flatMap((o) => o.legs.filter((l) => legSource(l.name) === "wallet"))
    .map((l) => legAmount(l))
    .filter((n): n is number => n !== null);
  const rtoFreightTotal = rtoFreightKnown.reduce((s, n) => s + n, 0);
  const rtoFreightUnknownCount = rtoOrders.length - rtoFreightKnown.length;
  const rtoKept = rtoOrders
    .flatMap((o) => o.legs.filter((l) => legSource(l.name) === "pg" && l.tag !== "estimated" && (legAmount(l) ?? 0) > 0))
    .reduce((s, l) => s + (legAmount(l) ?? 0), 0);

  return [
    {
      key: "settled",
      label: "Settled to Bank",
      value: fmt(bankPg + bankShip),
      foot: `From Cashfree <b>${fmt(bankPg)}</b><br>From iCarry (COD) <b>${fmt(bankShip)}</b>`,
      cls: "green",
      ids: uniqIds(bankHits),
    },
    {
      key: "pg",
      label: "Pending from Cashfree",
      value: fmt(pgSafe + pgRisk),
      foot: `Captured, not in bank yet<br>Order delivered <b>${fmt(pgSafe)}</b><br>Not delivered yet <b>${fmt(pgRisk)}</b> — refund risk`,
      cls: "amber",
      ids: uniqIds(pgPendingHits),
    },
    {
      key: "ship",
      label: "Pending from iCarry",
      value: fmt(shipPendingTotal),
      foot: `Delivered, COD collected, not remitted yet<br><b>${shipPendingHits.length}</b> order${shipPendingHits.length === 1 ? "" : "s"}`,
      cls: "blue",
      ids: uniqIds(shipPendingHits),
    },
    {
      key: "transit",
      label: "In Transit (COD)",
      value: fmt(onRoad.reduce((s, p) => s + (legAmount(p.leg) ?? 0), 0) + ndr.reduce((s, p) => s + (legAmount(p.leg) ?? 0), 0)),
      foot: `Not money until delivered<br>On route <b>${fmt(onRoad.reduce((s, p) => s + (legAmount(p.leg) ?? 0), 0))}</b> (${onRoad.length})<br>NDR / re-attempt <b>${fmt(
        ndr.reduce((s, p) => s + (legAmount(p.leg) ?? 0), 0)
      )}</b> (${ndr.length})`,
      cls: "muted",
      ids: uniqIds(transitHits),
    },
    {
      key: "unful",
      label: "Not Dispatched",
      value: fmt(unfulCod + unfulPaid),
      foot: `<b>${unfulOrders.length}</b> order${unfulOrders.length === 1 ? "" : "s"} waiting to ship<br>COD to collect <b>${fmt(unfulCod)}</b><br>Paid online <b>${fmt(unfulPaid)}</b>`,
      cls: "muted",
      ids: unfulOrders.map((o) => o.id),
    },
    {
      key: "rto",
      label: "RTO",
      value: `${rtoOrders.length} event${rtoOrders.length === 1 ? "" : "s"}`,
      foot:
        `Freight lost <b>${rtoFreightKnown.length ? "−" + fmt(Math.abs(rtoFreightTotal)) : "—"}</b>${
          rtoFreightUnknownCount ? ` (${rtoFreightUnknownCount} TBD — no per-shipment figure from iCarry yet)` : ""
        }<br>Advances kept <b>${fmt(rtoKept)}</b>`,
      cls: "red",
      ids: rtoOrders.map((o) => o.id),
    },
  ];
}
