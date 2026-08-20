import { Kpi, Order } from "./types";

export function fmt(n: number): string {
  const sign = n < 0 ? "-" : "";
  return `${sign}₹${Math.abs(n).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function numFromVal(v: string): number {
  return parseFloat(v.replace(/[₹,]/g, "").trim()) * (v.includes("-") ? -1 : 1);
}

/** Recomputed client-side so the KPI row updates instantly as new orders stream in, without waiting on a second API round trip. */
export function computeKpis(orders: Order[]): Kpi[] {
  const settledConfirmed = orders.reduce(
    (s, o) => s + o.legs.filter((l) => l.tag === "confirmed" && l.cls === "g").reduce((a, l) => a + numFromVal(l.val), 0),
    0
  );
  const pendingEst = orders.reduce(
    (s, o) => s + o.legs.filter((l) => l.tag === "estimated" && (l.cls === "a" || l.cls === "p")).reduce((a, l) => a + numFromVal(l.val), 0),
    0
  );
  const alertCount = orders.filter((o) => o.wa).length;
  const rtoCount = orders.filter((o) => o.shipCat === "rto").length;
  const netLoss =
    orders.reduce((s, o) => (o.net && !o.net.pos ? s + Math.abs(numFromVal(o.net.val)) : s), 0) -
    orders.reduce((s, o) => (o.net && o.net.pos ? s + numFromVal(o.net.val) : s), 0);

  return [
    { key: "settled", l: "Settled to Bank", v: fmt(settledConfirmed), f: "Confirmed, order-by-order", cls: "green" },
    { key: "pending", l: "Expected Soon", v: fmt(pendingEst), f: "With settlement dates shown", cls: "amber" },
    { key: "alerts", l: "WhatsApp Alerts Sent", v: String(alertCount), f: "Founder notified automatically", cls: "purple" },
    { key: "rto", l: "RTO Events", v: String(rtoCount), f: "This week", cls: "red" },
    { key: "rtoImpact", l: "Net RTO Impact", v: (netLoss >= 0 ? "-" : "+") + fmt(Math.abs(netLoss)), f: "Freight loss vs. kept advances", cls: "red" },
  ];
}
