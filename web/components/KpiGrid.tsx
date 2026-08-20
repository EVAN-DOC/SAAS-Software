import { Kpi } from "@/lib/types";

export default function KpiGrid({ kpis }: { kpis: Kpi[] }) {
  return (
    <div className="kpis">
      {kpis.map((k) => (
        <div className={`kpi ${k.cls}`} key={k.key}>
          <div className="l">{k.l}</div>
          <div className="v">{k.v}</div>
          <div className="f">{k.f}</div>
        </div>
      ))}
    </div>
  );
}
