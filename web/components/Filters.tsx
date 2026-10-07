import { Order } from "@/lib/types";
import { attentionOf, stageOf } from "@/lib/orderAnalysis";

export type FilterKey = "all" | "action" | "unful" | "transit" | "ndr" | "payout" | "paid" | "rto" | "cancelled";
export type TypeFilter = "all" | Order["type"];
export type SortKey = "new" | "old" | "wait" | "amt";

const FILTERS: { key: FilterKey; label: string; warn?: boolean }[] = [
  { key: "all", label: "All" },
  { key: "action", label: "Needs action", warn: true },
  { key: "unful", label: "Not shipped" },
  { key: "transit", label: "In transit" },
  { key: "ndr", label: "Delivery failed" },
  { key: "payout", label: "Delivered · payout pending" },
  { key: "paid", label: "Paid out" },
  { key: "rto", label: "RTO" },
  { key: "cancelled", label: "Cancelled" },
];

export function matchesFilter(order: Order, key: FilterKey): boolean {
  if (key === "all") return true;
  if (key === "action") {
    const a = attentionOf(order);
    return a.level === "red" || a.level === "amber";
  }
  return stageOf(order).key === key;
}

interface Props {
  orders: Order[]; // already scoped by date range + search + type, for accurate chip counts
  active: FilterKey;
  onChange: (key: FilterKey) => void;
  search: string;
  onSearch: (value: string) => void;
  typeFilter: TypeFilter;
  onTypeChange: (value: TypeFilter) => void;
  sort: SortKey;
  onSortChange: (value: SortKey) => void;
  resultCount: string;
}

export default function Filters({ orders, active, onChange, search, onSearch, typeFilter, onTypeChange, sort, onSortChange, resultCount }: Props) {
  return (
    <>
      <div className="filters">
        <div className="chipset">
          {FILTERS.map((f) => {
            const n = orders.filter((o) => matchesFilter(o, f.key)).length;
            return (
              <div
                key={f.key}
                className={`chip ${f.key === active ? "active" : ""} ${f.warn && n ? "warn" : ""}`}
                onClick={() => onChange(f.key)}
              >
                {f.label}
                <span className="cnt">{n}</span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="listbar">
        <input className="search-box" placeholder="Search order / customer / city…" value={search} onChange={(e) => onSearch(e.target.value)} />
        <select aria-label="Payment type" value={typeFilter} onChange={(e) => onTypeChange(e.target.value as TypeFilter)}>
          <option value="all">All payment types</option>
          <option value="prepaid">Full prepaid</option>
          <option value="cod">Full COD</option>
          <option value="partial">Partial COD</option>
        </select>
        <select aria-label="Sort orders" value={sort} onChange={(e) => onSortChange(e.target.value as SortKey)}>
          <option value="new">Newest first</option>
          <option value="old">Oldest first</option>
          <option value="wait">Waiting longest</option>
          <option value="amt">Highest value</option>
        </select>
        <span className="result-count">{resultCount}</span>
      </div>
      <div className="legend" style={{ marginBottom: 12 }}>
        <span>
          <span className="dot" style={{ background: "var(--green)" }} />
          Confirmed
        </span>
        <span>
          <span className="dot" style={{ background: "var(--blue)" }} />
          Not Settled
        </span>
        <span>
          <span className="dot" style={{ background: "var(--amber)" }} />
          Estimated
        </span>
        <span>
          <span className="dot" style={{ background: "var(--red)" }} />
          Loss / Alert
        </span>
      </div>
    </>
  );
}
