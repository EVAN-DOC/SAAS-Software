import { DashboardResponse } from "./types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";

export async function fetchDashboard(): Promise<DashboardResponse> {
  const res = await fetch(`${API_BASE_URL}/api/orders`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to load orders (${res.status})`);
  }
  return res.json();
}
