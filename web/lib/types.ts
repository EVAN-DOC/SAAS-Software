export type OrderType = "prepaid" | "cod" | "partial";
export type ShipCat = "delivered" | "transit" | "rto" | "ndr" | "unful" | "cancelled";
export type SyncStatus = "paid+tracking" | "tracking" | "none";
export type LegTag = "confirmed" | "estimated";
export type LegCls = "g" | "a" | "r" | "p";

export interface OrderLeg {
  name: string;
  amt: string;
  val: string;
  cls: LegCls;
  tag: LegTag;
  note: string;
}

export interface OrderNet {
  pos: boolean;
  label: string;
  val: string;
}

export interface Order {
  id: string;
  date: string;
  customer: string;
  loc: string;
  type: OrderType;
  items: string;
  shipCat: ShipCat;
  shipLabel: string;
  shipNote: string;
  track: boolean;
  trackingUrl?: string | null;
  sync: SyncStatus;
  wa: string | null;
  legs: OrderLeg[];
  net: OrderNet | null;
}

export interface Kpi {
  key: string;
  l: string;
  v: string;
  f: string;
  cls: "green" | "amber" | "red" | "purple";
}

export interface DashboardResponse {
  orders: Order[];
  mock: boolean;
}

export interface KpisResponse {
  kpis: Kpi[];
  mock: boolean;
}
