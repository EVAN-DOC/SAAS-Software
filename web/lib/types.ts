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

export type ShipStatus = "notscheduled" | "scheduled" | "transit" | "delivered" | "rto";

export interface TrackEvent {
  datetime: string;
  location: string;
  note: string;
}

export interface Shipment {
  id: string;
  date: string;
  customer: string;
  loc: string;
  items: string;
  type: OrderType;
  value: string;
  shipStatus: ShipStatus;
  shipLabel?: string;
  courier: string | null;
  shipmentId: string | null;
  edd: string | null;
  trackHistory: TrackEvent[];
  pincode: string | null;
  weightGrams: number;
  shipmentValue: number;
}

export interface ShipKpi {
  key: string;
  l: string;
  v: string;
  cls: "green" | "amber" | "red" | "blue";
}

export interface ShippingListResponse {
  shipments: Shipment[];
  kpis: ShipKpi[];
  mock: boolean;
  bookingEnabled: boolean;
}

export interface CourierOption {
  courier_id: string;
  courier_name: string;
  courier_group_name: string;
  courier_cost: string;
}

export interface EstimateResponse {
  success?: number;
  error?: string;
  estimate?: CourierOption[];
}

export interface BookResponse {
  success?: string;
  error?: string;
  shipment_id?: number;
  courier_id?: number;
  courier_name?: string;
  awb?: string | number;
  cost_estimate?: number;
  tracking_url?: string;
}

export interface LabelResponse {
  success?: number;
  error?: string;
  awb?: string;
  courier_name?: string;
  shipment_label?: { url: string; type: string }[];
}
