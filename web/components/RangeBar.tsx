"use client";

import { DateRangeKey } from "@/lib/dateRange";

const PRESETS: { key: DateRangeKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "7d", label: "Last 7 Days" },
  { key: "thismonth", label: "This Month" },
  { key: "all", label: "All Time" },
];

interface Props {
  value: DateRangeKey;
  onChange: (value: DateRangeKey) => void;
}

export default function RangeBar({ value, onChange }: Props) {
  const today = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="rangebar">
      <span className="rb-title">Date range · Orders &amp; KPIs</span>
      {PRESETS.map((p) => (
        <button key={p.key} className={`preset ${value === p.key ? "on" : ""}`} onClick={() => onChange(p.key)}>
          {p.label}
        </button>
      ))}
      <span className="rb-today">Today: {today}</span>
    </div>
  );
}
