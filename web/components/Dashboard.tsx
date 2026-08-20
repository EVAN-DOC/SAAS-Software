"use client";

import { useMemo, useState } from "react";
import Sidebar from "./Sidebar";
import KpiGrid from "./KpiGrid";
import Filters, { FilterKey } from "./Filters";
import OrderList from "./OrderList";
import { Order } from "@/lib/types";
import { computeKpis } from "@/lib/format";

const PAGE_SIZE = 25;

interface Props {
  initialOrders: Order[];
  mock: boolean;
  loadError: string | null;
}

export default function Dashboard({ initialOrders, mock, loadError }: Props) {
  const [orders] = useState(initialOrders);
  const [active, setActive] = useState<FilterKey>("all");
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return orders.filter((o) => {
      let passFilter: boolean;
      switch (active) {
        case "all":
          passFilter = true;
          break;
        case "prepaid":
        case "cod":
        case "partial":
          passFilter = o.type === active;
          break;
        case "alerts":
          passFilter = Boolean(o.wa) || o.shipCat === "ndr" || o.shipCat === "unful";
          break;
        case "confirmed":
          passFilter = o.legs.every((l) => l.tag === "confirmed");
          break;
        default:
          passFilter = true;
      }
      if (!passFilter) return false;
      if (!term) return true;
      return (
        o.id.toLowerCase().includes(term) ||
        o.customer.toLowerCase().includes(term) ||
        o.loc.toLowerCase().includes(term)
      );
    });
  }, [orders, active, search]);

  const kpis = useMemo(() => computeKpis(orders), [orders]);
  const visible = filtered.slice(0, visibleCount);

  function handleFilterChange(key: FilterKey) {
    setActive(key);
    setVisibleCount(PAGE_SIZE);
  }

  function handleSearch(value: string) {
    setSearch(value);
    setVisibleCount(PAGE_SIZE);
  }

  return (
    <>
      <Sidebar />
      <div className="main">
        <header>
          <div>
            <h1 className="display">Orders — All Channels</h1>
            <div className="sub">Shopify · iCarry · Cashfree — synced live, one screen</div>
          </div>
          <div className="plan-badge">
            {mock ? "◐ Mock Data · Set MOCK_MODE=false for live sync" : "● Live Sync · Shopify + iCarry + Cashfree"}
          </div>
        </header>

        {loadError && (
          <div className="state-msg" style={{ background: "var(--red-bg)", color: "var(--red)", borderRadius: 12, marginBottom: 20 }}>
            Couldn&apos;t load orders from the API server ({loadError}). Is the backend running on{" "}
            {process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000"}?
          </div>
        )}

        <KpiGrid kpis={kpis} />

        <Filters
          active={active}
          onChange={handleFilterChange}
          search={search}
          onSearch={handleSearch}
          resultCount={`${Math.min(visibleCount, filtered.length)} / ${filtered.length} orders`}
        />

        <OrderList
          orders={visible}
          visibleCount={visibleCount}
          totalCount={filtered.length}
          onLoadMore={() => setVisibleCount((v) => v + PAGE_SIZE)}
        />

        <footer>ONESCREEN · {orders.length} ORDERS · {mock ? "SAMPLE DATA" : "LIVE FROM SHOPIFY / ICARRY / CASHFREE"}</footer>
      </div>
    </>
  );
}
