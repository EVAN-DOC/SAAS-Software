export type DateRangeKey = "all" | "today" | "yesterday" | "7d" | "30d" | "90d" | "180d";

export const DATE_RANGES: { key: DateRangeKey; label: string }[] = [
  { key: "all", label: "All Time" },
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "7d", label: "Last 7 Days" },
  { key: "30d", label: "Last 30 Days" },
  { key: "90d", label: "Last 90 Days" },
  { key: "180d", label: "Last 180 Days" },
];

const RANGE_DAYS: Partial<Record<DateRangeKey, number>> = { "7d": 7, "30d": 30, "90d": 90, "180d": 180 };

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function isWithinDateRange(dateIso: string, range: DateRangeKey): boolean {
  if (range === "all") return true;

  const orderDate = new Date(dateIso);
  const now = new Date();

  if (range === "today") {
    const start = startOfDay(now);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    return orderDate >= start && orderDate < end;
  }

  if (range === "yesterday") {
    const end = startOfDay(now);
    const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
    return orderDate >= start && orderDate < end;
  }

  const days = RANGE_DAYS[range];
  if (!days) return true;
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return orderDate >= cutoff;
}
