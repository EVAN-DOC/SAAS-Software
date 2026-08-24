import { useState } from "react";
import { Shipment } from "@/lib/types";

const STATUS_LABEL: Record<Shipment["shipStatus"], string> = {
  notscheduled: "Not Scheduled",
  scheduled: "Scheduled",
  transit: "In-Transit",
  delivered: "Delivered",
  rto: "RTO",
};

const TYPE_LABEL: Record<Shipment["type"], string> = {
  cod: "Full COD",
  prepaid: "Full Prepaid",
  partial: "Partial-COD",
};

interface Props {
  shipment: Shipment;
  onSchedule: (id: string) => void;
  onTrack: (id: string) => void;
  onLabel: (id: string) => void;
  onScheduleReturn: (id: string) => void;
  labelLoading: boolean;
  returnLoading: boolean;
}

export default function ShipmentCard({ shipment: o, onSchedule, onTrack, onLabel, onScheduleReturn, labelLoading, returnLoading }: Props) {
  const [open, setOpen] = useState(false);
  const isNotScheduled = o.shipStatus === "notscheduled";
  const isDelivered = o.shipStatus === "delivered";
  const courierNote = isNotScheduled ? "Awaiting courier assignment" : [o.courier, o.shipmentId].filter(Boolean).join(" · ") || "Awaiting courier update";

  function stop(fn: () => void) {
    return (e: React.MouseEvent) => {
      e.stopPropagation();
      fn();
    };
  }

  return (
    <div className={`card ${open ? "open" : ""}`} onClick={() => setOpen((v) => !v)}>
      <div className="card-top">
        <div>
          <div className="oid">{o.id}</div>
          <div className="odate">{o.date}</div>
        </div>
        <div>
          <div className="cust">{o.customer}</div>
          <div className="loc">{o.loc}</div>
        </div>
      </div>
      <div className="card-product">
        <span className={`type-tag ${o.type}`}>{TYPE_LABEL[o.type]}</span>
        <div className="items">
          {o.items} · {o.value}
        </div>
      </div>
      <div className="status-row">
        <div>
          <span className={`badge ${o.shipStatus}`}>{STATUS_LABEL[o.shipStatus]}</span>
          <div className="courier-note">
            {courierNote}
            <span className="chevron">{open ? "▾" : "▸"}</span>
          </div>
        </div>
        {isNotScheduled ? (
          <button className="btn schedule" onClick={stop(() => onSchedule(o.id))}>
            Schedule Shipment
          </button>
        ) : (
          <div className="btn-group">
            <button className="btn track" onClick={stop(() => onTrack(o.id))}>
              Track
            </button>
            <button className="btn label" onClick={stop(() => onLabel(o.id))} disabled={labelLoading}>
              {labelLoading ? "Loading…" : "⬇ Label"}
            </button>
          </div>
        )}
      </div>

      <div className="ship-detail">
        <div className="ship-detail-grid">
          <div className="ship-detail-field full">
            <div className="dl">Delivery Address</div>
            <div className="dv">{[o.address, o.loc].filter(Boolean).join(", ") || "—"}</div>
          </div>
          <div className="ship-detail-field">
            <div className="dl">Phone</div>
            <div className="dv">{o.phone || "—"}</div>
          </div>
          <div className="ship-detail-field">
            <div className="dl">AWB</div>
            <div className="dv">{o.awb || "—"}</div>
          </div>
          {isDelivered ? (
            <>
              <div className="ship-detail-field">
                <div className="dl">Delivered On</div>
                <div className="dv">{o.deliveredDate || "—"}</div>
              </div>
              <div className="ship-detail-field">
                <div className="dl">Current Status</div>
                <div className="dv">Delivered</div>
              </div>
            </>
          ) : !isNotScheduled ? (
            <>
              <div className="ship-detail-field">
                <div className="dl">EDD</div>
                <div className="dv">{o.edd || "—"}</div>
              </div>
              <div className="ship-detail-field">
                <div className="dl">Current Location</div>
                <div className="dv">{o.currentLocation || "—"}</div>
              </div>
            </>
          ) : null}
        </div>

        {isDelivered && (
          o.returnPickup ? (
            <div className="return-info">
              Return pickup scheduled · AWB {o.returnPickup.awb || "—"}
              {o.returnPickup.courierName ? ` · ${o.returnPickup.courierName}` : ""}
            </div>
          ) : (
            <button className="btn return-pickup" onClick={stop(() => onScheduleReturn(o.id))} disabled={returnLoading}>
              {returnLoading ? "Scheduling…" : "↩ Schedule Return Pickup"}
            </button>
          )
        )}
      </div>
    </div>
  );
}
