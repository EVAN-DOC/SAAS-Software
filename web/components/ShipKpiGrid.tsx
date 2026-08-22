import { ShipKpi } from "@/lib/types";

export default function ShipKpiGrid({ kpis }: { kpis: ShipKpi[] }) {
  return (
    <div className="kpis" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
      {kpis.map((k) => (
        <div className={`kpi ${k.cls}`} key={k.key}>
          <div className="l">{k.l}</div>
          <div className="v">{k.v}</div>
        </div>
      ))}
    </div>
  );
}
