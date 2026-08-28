"use client";

import { useMemo, useState } from "react";
import Sidebar from "./Sidebar";
import ShipKpiGrid from "./ShipKpiGrid";
import ShipmentCard from "./ShipmentCard";
import ScheduleModal from "./ScheduleModal";
import TrackModal from "./TrackModal";
import Toast from "./Toast";
import Pagination from "./Pagination";
import { Shipment, ShipStatus } from "@/lib/types";
import { fetchLabel, scheduleReturnPickup } from "@/lib/api";
import { DATE_RANGES, DateRangeKey, isWithinDateRange } from "@/lib/dateRange";

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
  const [search, setSearch] = useState("");
  const [dateRange, setDateRange] = useState<DateRangeKey>("all");
  const [page, setPage] = useState(1);
  const [trackId, setTrackId] = useState<string | null>(null);
  const [scheduleId, setScheduleId] = useState<string | null>(null);
  const [labelLoadingId, setLabelLoadingId] = useState<string | null>(null);
  const [returnLoadingId, setReturnLoadingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  }

  const dateFiltered = useMemo(() => shipments.filter((s) => isWithinDateRange(s.date, dateRange)), [shipments, dateRange]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return dateFiltered.filter((s) => {
      if (activeFilter !== "all" && s.shipStatus !== activeFilter) return false;
      if (!term) return true;
      return (
        s.id.toLowerCase().includes(term) ||
        s.customer.toLowerCase().includes(term) ||
        s.loc.toLowerCase().includes(term)
      );
    });
  }, [dateFiltered, activeFilter, search]);

  const kpis = useMemo(() => {
    const counts: Record<ShipStatus, number> = { notscheduled: 0, scheduled: 0, transit: 0, delivered: 0, rto: 0 };
    dateFiltered.forEach((s) => { counts[s.shipStatus]++; });
    return [
      { key: "notscheduled", l: "Not Scheduled", v: String(counts.notscheduled), cls: "red" as const },
      { key: "scheduled", l: "Scheduled", v: String(counts.scheduled + counts.transit), cls: "blue" as const },
      { key: "delivered", l: "Delivered", v: String(counts.delivered), cls: "green" as const },
      { key: "rto", l: "RTO", v: String(counts.rto), cls: "amber" as const },
    ];
  }, [dateFiltered]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const trackShipment = shipments.find((s) => s.id === trackId) || null;
  const scheduleShipment = shipments.find((s) => s.id === scheduleId) || null;

  function handleFilterChange(key: ShipStatus | "all") {
    setActiveFilter(key);
    setPage(1);
  }

  function handleSearch(value: string) {
    setSearch(value);
    setPage(1);
  }

  function handleDateRangeChange(value: DateRangeKey) {
    setDateRange(value);
    setPage(1);
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

  async function handleScheduleReturn(orderId: string) {
    setReturnLoadingId(orderId);
    try {
      const result = await scheduleReturnPickup(orderId);
      setShipments((prev) =>
        prev.map((s) =>
          s.id === orderId
            ? {
                ...s,
                returnPickup: {
                  awb: result.awb ?? null,
                  courierName: result.courierName ?? null,
                  trackingUrl: result.trackingUrl ?? null,
                  pickupId: result.pickupId ?? null,
                  scheduledAt: result.scheduledAt ?? new Date().toISOString(),
                },
              }
            : s
        )
      );
      showToast(`Return pickup scheduled for ${orderId}${result.awb ? ` — AWB ${result.awb}` : ""}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Couldn't schedule return pickup");
    } finally {
      setReturnLoadingId(null);
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

        <div className="filters">
          <div className="chipset">
            {FILTERS.map((f) => (
              <div key={f.key} className={`chip ${f.key === activeFilter ? "active" : ""}`} onClick={() => handleFilterChange(f.key)}>
                {f.label}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <select
              className="search-box"
              style={{ width: 150, cursor: "pointer" }}
              value={dateRange}
              onChange={(e) => handleDateRangeChange(e.target.value as DateRangeKey)}
            >
              {DATE_RANGES.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.label}
                </option>
              ))}
            </select>
            <input
              className="search-box"
              placeholder="Search order / customer / city…"
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="result-count">
          {filtered.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, filtered.length)} / {filtered.length} orders
        </div>

        <div>
          {visible.map((s) => (
            <ShipmentCard
              key={s.id}
              shipment={s}
              onSchedule={setScheduleId}
              onTrack={setTrackId}
              onLabel={handleLabel}
              onScheduleReturn={handleScheduleReturn}
              labelLoading={labelLoadingId === s.id}
              returnLoading={returnLoadingId === s.id}
            />
          ))}
          {visible.length === 0 && <div className="state-msg">No orders match this filter.</div>}
        </div>

        <Pagination page={page} totalPages={totalPages} onChange={setPage} />

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
