import { OrderKpi } from "@/lib/types";

interface Props {
  kpis: OrderKpi[];
  onView: (kpi: OrderKpi) => void;
}

export default function KpiGrid({ kpis, onView }: Props) {
  return (
    <div className="kpis">
      {kpis.map((k) => (
        <div className={`kpi ${k.cls}`} key={k.key}>
          <div className="l">{k.label}</div>
          <div className="v">{k.value}</div>
          <div className="f" dangerouslySetInnerHTML={{ __html: k.foot }} />
          <div className="rng">
            <span className="asof">As of now</span>
            <button className="view-link" onClick={() => onView(k)}>
              Orders ({new Set(k.ids).size})
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
