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
  manual: boolean;
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

export interface ReturnPickup {
  awb: string | null;
  courierName: string | null;
  trackingUrl: string | null;
  pickupId: string | null;
  scheduledAt: string;
}

export interface Shipment {
  id: string;
  manual: boolean;
  cancelled: boolean;
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
  address: string | null;
  phone: string | null;
  awb: string | null;
  currentLocation: string | null;
  deliveredDate: string | null;
  returnPickup: ReturnPickup | null;
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

export interface ReturnPickupResponse extends ReturnPickup {
  success?: string;
  error?: string;
}

// ---- Manual Order (orders that never existed in Shopify — see MAN page) ----

export type ManualOrderTag = "INF" | "FAM" | "COMP" | "CUST";
export type ManualShipMode = "S" | "A" | "H";
export type ManualPaymentType = "NONE" | "COD";

export interface ManualOrderMeta {
  mock: boolean;
  bookingEnabled: boolean;
  pickupAddressId: string | null;
  originPincode: string | null;
  tags: { tag: ManualOrderTag; label: string }[];
}

export interface ManualConsignee {
  name: string;
  mobile: string;
  altMobile?: string;
  email?: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
}

export interface ManualParcel {
  contents: string;
  weightGrams: number;
  declaredValue: number;
  lengthCm: number;
  breadthCm: number;
  heightCm: number;
}

export interface ManualBookResponse {
  success?: string;
  error?: string;
  reference?: string;
  shipment_id?: number | string;
  courier_id?: number | string;
  courier_name?: string;
  awb?: string | number;
  tracking_url?: string;
}
