import {
  BookResponse,
  DashboardResponse,
  EstimateResponse,
  LabelResponse,
  ManualBookResponse,
  ManualConsignee,
  ManualOrderMeta,
  ManualOrderTag,
  ManualParcel,
  ManualPaymentType,
  ManualShipMode,
  ReturnPickupResponse,
  ShippingListResponse,
} from "./types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";

export interface HealthResponse {
  ok: boolean;
  mock: boolean;
  dashboardReady: boolean;
}

/** Cheap check — lets the page avoid blocking on a multi-minute fetch while the backend is still doing its first live sync. */
export async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch(`${API_BASE_URL}/health`, { cache: "no-store", signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`Health check failed (${res.status})`);
  return res.json();
}

export async function fetchDashboard(): Promise<DashboardResponse> {
  // Generous timeout: a first-ever live sync (hundreds of orders, each under
  // Shopify's 2 req/s cap) can legitimately take several minutes. Every
  // request after that is served from cache and returns almost instantly.
  const res = await fetch(`${API_BASE_URL}/api/orders`, { cache: "no-store", signal: AbortSignal.timeout(9 * 60 * 1000) });
  if (!res.ok) {
    throw new Error(`Failed to load orders (${res.status})`);
  }
  return res.json();
}

export async function fetchShippingList(): Promise<ShippingListResponse> {
  const res = await fetch(`${API_BASE_URL}/api/shipments`, { cache: "no-store", signal: AbortSignal.timeout(9 * 60 * 1000) });
  if (!res.ok) throw new Error(`Failed to load shipments (${res.status})`);
  return res.json();
}

/** Real courier options for this order's actual parcel — read-only, safe to call freely. */
export async function fetchEstimate(orderId: string): Promise<EstimateResponse> {
  const res = await fetch(`${API_BASE_URL}/api/shipments/${encodeURIComponent(orderId)}/estimate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || `Estimate failed (${res.status})`);
  return data;
}

/** REAL booking — creates an actual shipment with a courier and spends money. Not a preview. */
export async function bookShipment(orderId: string, courierId: string): Promise<BookResponse> {
  const res = await fetch(`${API_BASE_URL}/api/shipments/${encodeURIComponent(orderId)}/book`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ courierId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || `Booking failed (${res.status})`);
  return data;
}

export async function fetchLabel(orderId: string): Promise<LabelResponse> {
  const res = await fetch(`${API_BASE_URL}/api/shipments/${encodeURIComponent(orderId)}/label`);
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || `Label fetch failed (${res.status})`);
  return data;
}

/** REAL booking — schedules an actual reverse pickup for a delivered shipment and generates a new AWB for the return leg. */
export async function scheduleReturnPickup(orderId: string): Promise<ReturnPickupResponse> {
  const res = await fetch(`${API_BASE_URL}/api/shipments/${encodeURIComponent(orderId)}/return-pickup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || `Return pickup scheduling failed (${res.status})`);
  return data;
}

// ---- Manual Order (orders that never existed in Shopify — see MAN page) ----

export async function fetchManualOrderMeta(): Promise<ManualOrderMeta> {
  const res = await fetch(`${API_BASE_URL}/api/manual-orders/meta`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Couldn't load manual-order settings (${res.status})`);
  return res.json();
}

export async function fetchNextManualReference(tag: ManualOrderTag): Promise<string> {
  const res = await fetch(`${API_BASE_URL}/api/manual-orders/next-reference?tag=${encodeURIComponent(tag)}`, { cache: "no-store" });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || `Couldn't get next reference (${res.status})`);
  return data.reference;
}

export async function fetchManualEstimate(input: {
  pincode: string;
  weightGrams: number;
  lengthCm: number;
  breadthCm: number;
  heightCm: number;
  declaredValue: number;
  mode: ManualShipMode;
  isCod: boolean;
}): Promise<EstimateResponse> {
  const res = await fetch(`${API_BASE_URL}/api/manual-orders/estimate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || `Estimate failed (${res.status})`);
  return data;
}

/** REAL, consequential action — creates an actual shipment with a courier and spends money. Not a preview. */
export async function bookManualOrder(input: {
  tag: ManualOrderTag;
  note: string | null;
  consignee: ManualConsignee;
  parcel: ManualParcel;
  mode: ManualShipMode;
  payment: { type: ManualPaymentType; codAmount?: number };
  courierId: string;
  courierName: string;
  returnAddressId?: string;
  rtoAddressId?: string;
}): Promise<ManualBookResponse> {
  const res = await fetch(`${API_BASE_URL}/api/manual-orders/book`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || `Booking failed (${res.status})`);
  return data;
}

export async function fetchManualLabel(reference: string): Promise<LabelResponse> {
  const res = await fetch(`${API_BASE_URL}/api/manual-orders/${encodeURIComponent(reference)}/label`);
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || `Label fetch failed (${res.status})`);
  return data;
}

export async function fetchManualTracking(reference: string): Promise<{ status?: string; error?: string }> {
  const res = await fetch(`${API_BASE_URL}/api/manual-orders/${encodeURIComponent(reference)}/track`);
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || `Tracking fetch failed (${res.status})`);
  return data;
}
