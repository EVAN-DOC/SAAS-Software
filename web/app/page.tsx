import Dashboard from "@/components/Dashboard";
import { fetchDashboard } from "@/lib/api";

export default async function Page() {
  let orders: Awaited<ReturnType<typeof fetchDashboard>>["orders"] = [];
  let mock = false;
  let loadError: string | null = null;

  try {
    const data = await fetchDashboard();
    orders = data.orders;
    mock = data.mock;
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Could not reach the API server";
  }

  return <Dashboard initialOrders={orders} mock={mock} loadError={loadError} />;
}
