"use client";

import { useMemo, useState } from "react";
import Sidebar from "./Sidebar";
import ShipKpiGrid from "./ShipKpiGrid";
import ShipmentCard from "./ShipmentCard";
import ScheduleModal from "./ScheduleModal";
import TrackModal from "./TrackModal";
import Toast from "./Toast";
import { Shipment, ShipStatus } from "@/lib/types";
import { fetchLabel } from "@/lib/api";

const PAGE_SIZE = 15;

const FILTERS: { key: ShipStatus | "all"; label: string }[] = [
  { key: "all", label: "All Orders" },
  { key: "notscheduled", label: "Not Scheduled" },
  { key: "scheduled", label: "Scheduled" },
  { key: "transit", label: "In-Transit" },
  { key: "delivered", label: "Delivered" },
  { key: "rto", label: "RTO" },
];

interface Props {
  initialShipments: Shipment[];
  mock: boolean;
  bookingEnabled: boolean;
  loadError: string | null;
}

export default function ShippingDashboard({ initialShipments, mock, bookingEnabled, loadError }: Props) {
  const [shipments, setShipments] = useState(initialShipments);
  const [activeFilter, setActiveFilter] = useState<ShipStatus | "all">("all");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [trackId, setTrackId] = useState<string | null>(null);
  const [scheduleId, setScheduleId] = useState<string | null>(null);
  const [labelLoadingId, setLabelLoadingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  }

  const filtered = useMemo(
    () => shipments.filter((s) => activeFilter === "all" || s.shipStatus === activeFilter),
    [shipments, activeFilter]
  );

  const kpis = useMemo(() => {
    const counts: Record<ShipStatus, number> = { notscheduled: 0, scheduled: 0, transit: 0, delivered: 0, rto: 0 };
    shipments.forEach((s) => { counts[s.shipStatus]++; });
    return [
      { key: "notscheduled", l: "Not Scheduled", v: String(counts.notscheduled), cls: "red" as const },
      { key: "scheduled", l: "Scheduled", v: String(counts.scheduled + counts.transit), cls: "blue" as const },
      { key: "delivered", l: "Delivered", v: String(counts.delivered), cls: "green" as const },
      { key: "rto", l: "RTO", v: String(counts.rto), cls: "amber" as const },
    ];
  }, [shipments]);

  const visible = filtered.slice(0, visibleCount);
  const trackShipment = shipments.find((s) => s.id === trackId) || null;
  const scheduleShipment = shipments.find((s) => s.id === scheduleId) || null;

  function handleFilterChange(key: ShipStatus | "all") {
    setActiveFilter(key);
    setVisibleCount(PAGE_SIZE);
  }

  async function handleLabel(orderId: string) {
    setLabelLoadingId(orderId);
    try {
      const result = await fetchLabel(orderId);
      const url = result.shipment_label?.[0]?.url;
      if (url) {
        window.open(url, "_blank", "noopener,noreferrer");
        showToast(`Label opened for ${orderId}`);
      } else {
        showToast(`No label available yet for ${orderId}`);
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Couldn't fetch label");
    } finally {
      setLabelLoadingId(null);
    }
  }

  function handleBooked(orderId: string, result: { courier: string; awb: string | number; cost: number }) {
    setShipments((prev) =>
      prev.map((s) => (s.id === orderId ? { ...s, shipStatus: "scheduled", courier: result.courier } : s))
    );
    setScheduleId(null);
    showToast(`Booked ${orderId} with ${result.courier} — ₹${result.cost.toFixed(2)}`);
  }

  return (
    <>
      <Sidebar />
      <div className="main">
        <h1 className="display">Shipping — Schedule, Track &amp; Labels</h1>
        <div className="sub">Every Shopify order, ready to book, track, and print with iCarry — no need to open iCarry at all</div>

        {loadError && (
          <div className="state-msg" style={{ background: "var(--red-bg)", color: "var(--red)", borderRadius: 12, marginBottom: 20 }}>
            Couldn&apos;t load shipments from the API server ({loadError}).
          </div>
        )}

        {!bookingEnabled && !mock && (
          <div className="notice-box">
            Real shipment booking isn&apos;t configured — set <code>ICARRY_PICKUP_ADDRESS_ID</code> and{" "}
            <code>ICARRY_ORIGIN_PINCODE</code> in the backend to enable it. Tracking and labels for already-shipped
            orders still work.
          </div>
        )}

        <ShipKpiGrid kpis={kpis} />

        <div className="chips">
          {FILTERS.map((f) => (
            <div key={f.key} className={`chip ${f.key === activeFilter ? "active" : ""}`} onClick={() => handleFilterChange(f.key)}>
              {f.label}
            </div>
          ))}
        </div>
        <div className="result-count">
          {Math.min(visibleCount, filtered.length)} / {filtered.length} orders
        </div>

        <div>
          {visible.map((s) => (
            <ShipmentCard
              key={s.id}
              shipment={s}
              onSchedule={setScheduleId}
              onTrack={setTrackId}
              onLabel={handleLabel}
              labelLoading={labelLoadingId === s.id}
            />
          ))}
          {visible.length === 0 && <div className="state-msg">No orders match this filter.</div>}
        </div>

        <button className="load-more-btn" disabled={visibleCount >= filtered.length} onClick={() => setVisibleCount((v) => v + PAGE_SIZE)}>
          {visibleCount >= filtered.length ? "All orders loaded" : `Load more (${filtered.length - visibleCount} remaining)`}
        </button>

        <footer>ONESCREEN · {shipments.length} ORDERS · {mock ? "SAMPLE DATA" : "LIVE FROM SHOPIFY + ICARRY"}</footer>
      </div>

      <ScheduleModal
        shipment={scheduleShipment}
        bookingEnabled={bookingEnabled}
        onClose={() => setScheduleId(null)}
        onBooked={handleBooked}
      />
      <TrackModal shipment={trackShipment} onClose={() => setTrackId(null)} />
      <Toast message={toast} />
    </>
  );
}
