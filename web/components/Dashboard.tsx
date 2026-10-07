"use client";

import { useEffect, useMemo, useState } from "react";
import Sidebar from "./Sidebar";
import RangeBar from "./RangeBar";
import KpiGrid from "./KpiGrid";
import MoneyBar from "./MoneyBar";
import Filters, { FilterKey, SortKey, TypeFilter, matchesFilter } from "./Filters";
import OrderList from "./OrderList";
import { Order, OrderKpi } from "@/lib/types";
import { ageDays, computeOrderKpis, orderValue } from "@/lib/orderAnalysis";
import { DateRangeKey, isWithinDateRange } from "@/lib/dateRange";
import { fetchDashboard } from "@/lib/api";

const PAGE_SIZE = 15;
// The backend now pushes a cache refresh the moment Shopify fires an
// orders/create|updated|cancelled webhook (see server/src/routes/shopifyWebhooks.js),
// but this page itself was still only fetching once per navigation — nothing
// made an already-open tab pick that fresh data up. A plain poll on top of
// that webhook-driven refresh is what actually gets a new order on screen
// without a manual reload.
const REFRESH_INTERVAL_MS = 30000;

interface Props {
  initialOrders: Order[];
  mock: boolean;
  loadError: string | null;
}

function sortOrders(list: Order[], sort: SortKey): Order[] {
  const byTime = (o: Order) => new Date(o.date).getTime();
  const s = [...list];
  if (sort === "new") s.sort((a, b) => byTime(b) - byTime(a));
  if (sort === "old") s.sort((a, b) => byTime(a) - byTime(b));
  if (sort === "amt") s.sort((a, b) => orderValue(b) - orderValue(a));
  if (sort === "wait") {
    const rank = (o: Order) => (o.shipCat === "ndr" ? 3 : o.shipCat === "unful" ? 2 : o.shipCat === "transit" ? 1 : 0);
    s.sort((a, b) => rank(b) - rank(a) || ageDays(b.date) - ageDays(a.date));
  }
  return s;
}

export default function Dashboard({ initialOrders, mock, loadError }: Props) {
  const [orders, setOrders] = useState(initialOrders);
  const [dateRange, setDateRange] = useState<DateRangeKey>("all");
  const [active, setActive] = useState<FilterKey>("all");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [sort, setSort] = useState<SortKey>("new");
  const [page, setPage] = useState(1);
  const [kpiFilter, setKpiFilter] = useState<{ key: string; label: string; ids: Set<string> } | null>(null);

  // Mock data never changes and there's nothing live to poll for.
  useEffect(() => {
    if (mock) return;
    const interval = setInterval(() => {
      fetchDashboard()
        .then((data) => setOrders(data.orders))
        .catch(() => {
          // Transient failure — keep showing what's already on screen and
          // just try again on the next tick instead of surfacing an error
          // for what's a background refresh, not a user action.
        });
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [mock]);

  // Date range scopes the whole page (list + KPIs + money bar) — the single
  // global range this page uses (a deliberate scope cut from the original
  // per-KPI date pickers in the mockup this was built from).
  const dateFiltered = useMemo(() => orders.filter((o) => isWithinDateRange(o.date, dateRange)), [orders, dateRange]);
  const kpis = useMemo(() => computeOrderKpis(dateFiltered), [dateFiltered]);

  const kpiScoped = useMemo(
    () => (kpiFilter ? dateFiltered.filter((o) => kpiFilter.ids.has(o.id)) : dateFiltered),
    [dateFiltered, kpiFilter]
  );

  // Base for chip counts (date + KPI-click + type + search already applied, stage chip not yet) — same scope the chips themselves filter from.
  const chipBase = useMemo(() => {
    const term = search.trim().toLowerCase();
    return kpiScoped.filter((o) => {
      if (typeFilter !== "all" && o.type !== typeFilter) return false;
      if (!term) return true;
      return o.id.toLowerCase().includes(term) || o.customer.toLowerCase().includes(term) || o.loc.toLowerCase().includes(term) || o.items.toLowerCase().includes(term);
    });
  }, [kpiScoped, typeFilter, search]);

  const filtered = useMemo(() => sortOrders(chipBase.filter((o) => matchesFilter(o, active)), sort), [chipBase, active, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function handleFilterChange(key: FilterKey) {
    setActive(key);
    setPage(1);
  }
  function handleSearch(value: string) {
    setSearch(value);
    setPage(1);
  }
  function handleTypeChange(value: TypeFilter) {
    setTypeFilter(value);
    setPage(1);
  }
  function handleSortChange(value: SortKey) {
    setSort(value);
    setPage(1);
  }
  function handleDateRangeChange(value: DateRangeKey) {
    setDateRange(value);
    setKpiFilter(null);
    setPage(1);
  }
  function handleViewKpi(kpi: OrderKpi) {
    setKpiFilter({ key: kpi.key, label: kpi.label, ids: new Set(kpi.ids) });
    setActive("all");
    setPage(1);
  }
  function clearKpiFilter() {
    setKpiFilter(null);
    setPage(1);
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

        <RangeBar value={dateRange} onChange={handleDateRangeChange} />
        <KpiGrid kpis={kpis} onView={handleViewKpi} />

        {kpiFilter && (
          <div className="kpi-filter on">
            <span>
              Showing {kpiFilter.ids.size} order{kpiFilter.ids.size === 1 ? "" : "s"} behind &quot;{kpiFilter.label}&quot;
            </span>
            <button onClick={clearKpiFilter}>Show all orders ✕</button>
          </div>
        )}

        <Filters
          orders={chipBase}
          active={active}
          onChange={handleFilterChange}
          search={search}
          onSearch={handleSearch}
          typeFilter={typeFilter}
          onTypeChange={handleTypeChange}
          sort={sort}
          onSortChange={handleSortChange}
          resultCount={`${filtered.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}-${Math.min(page * PAGE_SIZE, filtered.length)} / ${filtered.length} orders`}
        />

        <MoneyBar orders={filtered} />

        <OrderList orders={visible} page={page} totalPages={totalPages} onPageChange={setPage} />

        <footer>ONESCREEN · {orders.length} ORDERS · {mock ? "SAMPLE DATA" : "LIVE FROM SHOPIFY / ICARRY / CASHFREE"}</footer>
      </div>
    </>
  );
}
