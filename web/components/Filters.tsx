export type FilterKey = "all" | "prepaid" | "cod" | "partial" | "alerts" | "confirmed";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All Orders" },
  { key: "prepaid", label: "Prepaid" },
  { key: "cod", label: "COD" },
  { key: "partial", label: "Partial-COD" },
  { key: "alerts", label: "Needs Attention" },
  { key: "confirmed", label: "Fully Settled" },
];

interface Props {
  active: FilterKey;
  onChange: (key: FilterKey) => void;
  search: string;
  onSearch: (value: string) => void;
  resultCount: string;
}

export default function Filters({ active, onChange, search, onSearch, resultCount }: Props) {
  return (
    <>
      <div className="filters">
        <div className="chipset">
          {FILTERS.map((f) => (
            <div
              key={f.key}
              className={`chip ${f.key === active ? "active" : ""}`}
              onClick={() => onChange(f.key)}
            >
              {f.label}
            </div>
          ))}
        </div>
        <input
          className="search-box"
          placeholder="Search order / customer / city…"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
        />
      </div>
      <div className="legend" style={{ marginBottom: 12 }}>
        <span>
          <span className="dot" style={{ background: "var(--green)" }} />
          Confirmed
        </span>
        <span>
          <span className="dot" style={{ background: "var(--amber)" }} />
          Estimated
        </span>
        <span>
          <span className="dot" style={{ background: "var(--red)" }} />
          Loss / Alert
        </span>
        <span style={{ marginLeft: "auto", fontFamily: "'IBM Plex Mono'" }}>{resultCount}</span>
      </div>
    </>
  );
}
