"use client";

import { useEffect, useState } from "react";
import { CourierOption, Shipment } from "@/lib/types";
import { fetchEstimate, bookShipment } from "@/lib/api";

interface Props {
  shipment: Shipment | null;
  bookingEnabled: boolean;
  onClose: () => void;
  onBooked: (orderId: string, result: { courier: string; awb: string | number; cost: number }) => void;
}

export default function ScheduleModal({ shipment, bookingEnabled, onClose, onBooked }: Props) {
  const [options, setOptions] = useState<CourierOption[] | null>(null);
  const [selected, setSelected] = useState<CourierOption | null>(null);
  const [loading, setLoading] = useState(false);
  const [booking, setBooking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [consigneeName, setConsigneeName] = useState("");

  useEffect(() => {
    if (!shipment) return;
    setOptions(null);
    setSelected(null);
    setError(null);
    setConsigneeName(shipment.customer);
    if (!bookingEnabled) return; // don't spend an estimate call if booking can't complete anyway
    setLoading(true);
    fetchEstimate(shipment.id)
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setOptions(data.estimate || []);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load courier options"))
      .finally(() => setLoading(false));
  }, [shipment, bookingEnabled]);

  if (!shipment) return null;

  async function handleConfirm() {
    if (!selected || !shipment) return;
    setBooking(true);
    setError(null);
    try {
      const result = await bookShipment(shipment.id, selected.courier_id, consigneeName);
      if (result.error) throw new Error(result.error);
      onBooked(shipment.id, {
        courier: result.courier_name || selected.courier_name,
        awb: result.awb || "—",
        cost: result.cost_estimate ?? Number(selected.courier_cost),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Booking failed");
    } finally {
      setBooking(false);
    }
  }

  return (
    <div className="overlay open">
      <div className="modal">
        <button className="modal-close" onClick={onClose}>
          ×
        </button>
        <h3>Choose a Courier</h3>
        <div className="modal-sub">
          {shipment.id} · {shipment.customer} · {shipment.items}
        </div>

        {!bookingEnabled && (
          <div className="notice-box">
            Booking isn&apos;t configured yet — set <code>ICARRY_PICKUP_ADDRESS_ID</code> and{" "}
            <code>ICARRY_ORIGIN_PINCODE</code> in the backend&apos;s <code>.env</code> to enable real shipment
            booking.
          </div>
        )}

        {bookingEnabled && (
          <div className="notice-box">Confirming books a real shipment with the selected courier and will incur real charges.</div>
        )}

        {error && <div className="notice-box" style={{ background: "var(--red-bg)", color: "var(--red)" }}>{error}</div>}

        {bookingEnabled && (
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: "var(--muted)", marginBottom: 5 }}>
              Consignee name (sent to the courier — edit if Shopify&apos;s name gets rejected)
            </label>
            <input
              className="search-box"
              style={{ width: "100%" }}
              value={consigneeName}
              onChange={(e) => setConsigneeName(e.target.value)}
              placeholder="Full name, letters and spaces only"
            />
          </div>
        )}

        {bookingEnabled && loading && <div className="modal-sub">Fetching live courier rates…</div>}

        {bookingEnabled && options && (
          <div>
            {options.map((c) => (
              <div
                key={c.courier_id}
                className={`courier-option ${selected?.courier_id === c.courier_id ? "selected" : ""}`}
                onClick={() => setSelected(c)}
              >
                <div>
                  <div className="cname">{c.courier_name || c.courier_group_name}</div>
                  <div className="cmeta">{c.courier_group_name}</div>
                </div>
                <div className="cprice">₹{Number(c.courier_cost).toFixed(2)}</div>
              </div>
            ))}
            {options.length === 0 && <div className="modal-sub">No courier options returned for this pincode.</div>}
          </div>
        )}

        <button className="confirm-btn" disabled={!bookingEnabled || !selected || !consigneeName.trim() || booking} onClick={handleConfirm}>
          {booking ? "Booking…" : "Confirm Booking"}
        </button>
      </div>
    </div>
  );
}
