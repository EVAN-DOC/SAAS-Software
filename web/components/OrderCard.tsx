"use client";

import { useState } from "react";
import { Order } from "@/lib/types";
import { ageDays, attentionOf, legAmount, legSource, legStatus, stageOf } from "@/lib/orderAnalysis";
import { fmt } from "@/lib/format";

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

const STEPS = ["Placed", "Shipped", "Delivered", "Paid out"];

function Journey({ order }: { order: Order }) {
  const stage = stageOf(order);
  const att = attentionOf(order);

  return (
    <div className="journey">
      <div className="trk" aria-label={stage.label}>
        {STEPS.map((name, i) => {
          let dotCls = "off";
          if (stage.step === -1) {
            dotCls = i === 0 ? "done" : "off";
          } else {
            const reached = i <= stage.step;
            dotCls = reached ? "done" : "";
            if (i === stage.step + 1 && !stage.bad) dotCls = "now";
            if (stage.bad && i === stage.step + 1) dotCls = "bad";
            if (stage.key === "paid") dotCls = "done";
          }
          const lineDone = stage.step !== -1 && i < stage.step;
          return (
            <span key={name}>
              <span className={`d ${dotCls}`} title={name} />
              {i < 3 && <span className={`ln ${lineDone ? "done" : ""}`} />}
            </span>
          );
        })}
      </div>
      <div className={`st ${stage.bad ? "bad" : stage.void ? "void" : stage.good ? "good" : ""}`}>{stage.label}</div>
      {stage.sub && stage.key !== "unful" && <div className="sub">{stage.sub}</div>}
      {att.text && att.level && <span className={`flag ${att.level}`}>{att.text}</span>}
    </div>
  );
}

function MoneyRows({ order }: { order: Order }) {
  return (
    <>
      {order.legs.map((l, i) => {
        const st = legStatus(l, order);
        const sw = st.bucket ? `c-${st.bucket}` : "c-unship";
        const amt = legSource(l.name) === "wallet" ? `−${l.val}` : l.val;
        return (
          <div className={`mrow ${st.void ? "void" : ""} ${st.bucket === "loss" ? "loss" : ""} ${st.bucket === "bank" ? "bank" : ""}`} key={i}>
            <span className={`sw ${sw}`} />
            <span>
              <span className="ms">{st.text}</span>
              {st.via && <span className="msrc">· {st.via}</span>}
            </span>
            <span className="amt">{amt}</span>
          </div>
        );
      })}
    </>
  );
}

export default function OrderCard({ order }: { order: Order }) {
  const [open, setOpen] = useState(false);
  const isCancelled = order.shipCat === "cancelled";
  const isVoid = isCancelled || order.legs.every((l) => legValue(l.val) === 0);
  const att = attentionOf(order);
  const age = ageDays(order.date);

  return (
    <div className={`order-card ${open ? "open" : ""} ${att.level ? `lvl-${att.level}` : ""} ${isVoid ? "is-void" : ""}`}>
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
          <div className="odate">
            {order.date}
            <br />
            <span className="age">{age <= 0 ? "today" : age === 1 ? "1 day ago" : `${age} days ago`}</span>
          </div>
        </div>
        <div>
          <div className="cust-name">{order.customer}</div>
          <div className="cust-loc">{order.loc}</div>
        </div>
        <div>
          <span className={`type-tag ${order.type}`}>{TYPE_LABEL[order.type]}</span>
          <div className="items-txt">{order.items}</div>
        </div>
        <Journey order={order} />
        <div>
          <MoneyRows order={order} />
        </div>
        {!isCancelled && <div className="chevron">▸</div>}
      </button>

      <div className="order-detail">
        <div className="detail-grid">
          <div className="breakdown">
            <h4>Money Breakdown</h4>
            {order.legs.map((l, i) => {
              const st = legStatus(l, order);
              const sw = st.bucket ? `c-${st.bucket}` : "c-unship";
              return (
                <div className="leg" key={i}>
                  <div>
                    <div className="ln">{l.name}</div>
                    <div className="ld">{l.amt}</div>
                    <div className="lstat">
                      <i className={sw} />
                      {st.text}
                      {st.via ? ` · ${st.via}` : ""}
                    </div>
                    <div className="ld" style={{ marginTop: 4 }}>
                      {l.note}
                    </div>
                  </div>
                  <div className={`lv ${l.cls}`}>{l.val}</div>
                </div>
              );
            })}
            {order.net && (
              <div className={`net-line ${order.net.pos ? "pos" : "neg"}`}>
                <span>{order.net.label}</span>
                <span>{order.net.val}</span>
              </div>
            )}
            {order.legs.length > 1 && !isCancelled && (
              <div className="mtotal">
                Order value {fmt(order.legs.reduce((s, l) => (legSource(l.name) === "wallet" ? s : s + (legAmount(l) ?? 0)), 0))}
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
