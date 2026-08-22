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
  labelLoading: boolean;
}

export default function ShipmentCard({ shipment: o, onSchedule, onTrack, onLabel, labelLoading }: Props) {
  const isNotScheduled = o.shipStatus === "notscheduled";
  const courierNote = isNotScheduled ? "Awaiting courier assignment" : [o.courier, o.shipmentId].filter(Boolean).join(" · ") || "Awaiting courier update";

  return (
    <div className="card">
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
          <div className="courier-note">{courierNote}</div>
        </div>
        {isNotScheduled ? (
          <button className="btn schedule" onClick={() => onSchedule(o.id)}>
            Schedule Shipment
          </button>
        ) : (
          <div className="btn-group">
            <button className="btn track" onClick={() => onTrack(o.id)}>
              Track
            </button>
            <button className="btn label" onClick={() => onLabel(o.id)} disabled={labelLoading}>
              {labelLoading ? "Loading…" : "⬇ Label"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
