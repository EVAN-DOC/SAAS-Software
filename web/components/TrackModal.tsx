import { Shipment } from "@/lib/types";

const STATUS_LABEL: Record<Shipment["shipStatus"], string> = {
  notscheduled: "Not Scheduled",
  scheduled: "Scheduled",
  transit: "In-Transit",
  delivered: "Delivered",
  rto: "RTO",
};

interface Props {
  shipment: Shipment | null;
  onClose: () => void;
}

export default function TrackModal({ shipment, onClose }: Props) {
  if (!shipment) return null;
  const history = [...shipment.trackHistory].reverse();

  return (
    <div className={`overlay ${shipment ? "open" : ""}`}>
      <div className="modal">
        <button className="modal-close" onClick={onClose}>
          ×
        </button>
        <h3>Track Shipment</h3>
        <div className="modal-sub">
          {shipment.id} · {shipment.customer} · {shipment.loc}
        </div>
        <div className="track-header">
          <div className="tstatus">
            {STATUS_LABEL[shipment.shipStatus]}
            {shipment.courier ? ` · ${shipment.courier}` : ""}
          </div>
          <div className="tmeta">
            Shipment ID {shipment.shipmentId || "—"} · EDD {shipment.edd || "—"}
          </div>
        </div>
        <div className="timeline">
          {history.length > 0 ? (
            history.map((h, i) => (
              <div className="tl-item" key={i}>
                <div className="tl-note">{h.note}</div>
                <div className="tl-meta">
                  {h.location} · {h.datetime}
                </div>
              </div>
            ))
          ) : (
            <div className="tl-item">
              <div className="tl-note">No tracking events yet</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
