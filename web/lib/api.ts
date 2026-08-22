import { DashboardResponse } from "./types";

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
