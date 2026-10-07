"use client";

import { Order } from "@/lib/types";
import { fmt } from "@/lib/format";
import { Bucket, BUCKET_LABEL, legAmount, legStatus } from "@/lib/orderAnalysis";

const FLOW: Exclude<Bucket, null>[] = ["bank", "pg", "ship", "transit", "unship"];
const SWATCH: Record<Exclude<Bucket, null>, string> = {
  bank: "c-bank",
  pg: "c-pg",
  ship: "c-ship",
  transit: "c-transit",
  unship: "c-unship",
  loss: "c-loss",
};

export default function MoneyBar({ orders }: { orders: Order[] }) {
  const totals: Record<Exclude<Bucket, null>, number> = { bank: 0, pg: 0, ship: 0, transit: 0, unship: 0, loss: 0 };
  orders.forEach((o) =>
    o.legs.forEach((l) => {
      const st = legStatus(l, o);
      if (st.bucket) totals[st.bucket] += Math.abs(legAmount(l) ?? 0);
    })
  );

  const money = totals.bank + totals.pg + totals.ship;
  const notYet = totals.transit + totals.unship;
  const whole = FLOW.reduce((s, k) => s + totals[k], 0) || 1;

  return (
    <div className="moneybar">
      <div className="mb-head">
        <div>
          <b>{fmt(money)}</b> <span>is real money — in bank or held by Cashfree / iCarry</span>
        </div>
        <div>
          <span>+ {fmt(notYet)} only if these orders get delivered</span>
        </div>
      </div>
      <div className="mb-track">
        {FLOW.map((k) =>
          totals[k] ? (
            <div
              key={k}
              className={SWATCH[k]}
              style={{ width: `${(totals[k] / whole) * 100}%` }}
              title={`${BUCKET_LABEL[k]}: ${fmt(totals[k])}`}
            />
          ) : null
        )}
      </div>
      <div className="mb-legend">
        {FLOW.map((k) => (
          <div className="it" key={k}>
            <span className="k">
              <i className={SWATCH[k]} />
              {BUCKET_LABEL[k]}
            </span>
            <b>{fmt(totals[k])}</b>
          </div>
        ))}
        <span className="sep" />
        <div className="it">
          <span className="k">
            <i className="c-loss" />
            Freight lost
          </span>
          <b>{totals.loss ? "−" + fmt(totals.loss) : "—"}</b>
        </div>
      </div>
    </div>
  );
}
