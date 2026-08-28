"use client";

import { useState } from "react";
import { Order } from "@/lib/types";

const TYPE_LABEL: Record<Order["type"], string> = {
  cod: "Full COD",
  prepaid: "Full Prepaid",
  partial: "Partial-COD",
};

const SYNC_LABEL: Record<Order["sync"], string> = {
  "paid+tracking": "Paid + Tracking Synced",
  tracking: "Tracking Synced",
  none: "Not Synced Yet",
};

const SYNC_CLS: Record<Order["sync"], string> = {
  "paid+tracking": "on",
  tracking: "warn",
  none: "off",
};

function legValue(val: string): number {
  return parseFloat(val.replace(/[₹,]/g, "")) || 0;
}

export default function OrderCard({ order }: { order: Order }) {
  const [open, setOpen] = useState(false);
  const isCancelled = order.shipCat === "cancelled";
  const isVoid = isCancelled || order.legs.every((l) => legValue(l.val) === 0);

  return (
    <div className={`order-card ${open ? "open" : ""}`}>
      <button
        className={`order-row ${isVoid ? "void" : ""}`}
        onClick={isCancelled ? undefined : () => setOpen((v) => !v)}
        disabled={isCancelled}
      >
        <div>
          <div className="oid">
            {order.id}
            {isVoid && <span className="void-tag">Void</span>}
            {order.manual && <span className="manual-tag">Manual</span>}
          </div>
          <div className="odate">{order.date}</div>
        </div>
        <div>
          <div className="cust-name">{order.customer}</div>
          <div className="cust-loc">{order.loc}</div>
        </div>
        <div>
          <span className={`type-tag ${order.type}`}>{TYPE_LABEL[order.type]}</span>
          <div className="items-txt">{order.items}</div>
        </div>
        <div>
          <span className={`pill ${order.shipCat}`}>
            <span className="led" />
            {order.shipLabel}
          </span>
          <div className="shipnote">{order.shipNote}</div>
        </div>
        <div>
          {order.legs.map((l, i) => (
            <div className="money-tag" key={i}>
              <span className={`datebadge ${l.tag}`}>{l.tag === "confirmed" ? "✓ settled" : `~ ${l.tag}`}</span>
              <span className="money-amt">{l.val}</span>
            </div>
          ))}
        </div>
        {!isCancelled && <div className="chevron">▸</div>}
      </button>

      <div className="order-detail">
        <div className="detail-grid">
          <div className="breakdown">
            <h4>Money Breakdown</h4>
            {order.legs.map((l, i) => (
              <div className="leg" key={i}>
                <div>
                  <div className="ln">{l.name}</div>
                  <div className="ld">{l.amt}</div>
                  <div className="ld" style={{ marginTop: 4 }}>
                    {l.note}
                  </div>
                </div>
                <div className={`lv ${l.cls}`}>{l.val}</div>
              </div>
            ))}
            {order.net && (
              <div className={`net-line ${order.net.pos ? "pos" : "neg"}`}>
                <span>{order.net.label}</span>
                <span>{order.net.val}</span>
              </div>
            )}
          </div>
          <div className="side-panel">
            <div className="action-row">
              <span className="lbl">Live Tracking</span>
              {order.track && order.trackingUrl ? (
                <a className="track-btn" href={order.trackingUrl} target="_blank" rel="noreferrer">
                  Track Order →
                </a>
              ) : (
                <button className="track-btn" disabled>
                  {order.track ? "Track Order →" : "Not Shipped"}
                </button>
              )}
            </div>
            <div className="action-row">
              <span className="lbl">Shopify Sync</span>
              <span className={`status-badge ${SYNC_CLS[order.sync]}`}>{SYNC_LABEL[order.sync]}</span>
            </div>
            <div className={`wa-alert ${order.wa ? "" : "none"}`}>
              <span className="ic">{order.wa ? "💬" : "○"}</span>
              <span>{order.wa || "No WhatsApp alert triggered for this order"}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
