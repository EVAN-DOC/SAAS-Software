import Dashboard from "@/components/Dashboard";
import SyncingScreen from "@/components/SyncingScreen";
import { fetchDashboard, fetchHealth } from "@/lib/api";

export default async function Page() {
  // Cheap check first — avoids blocking the whole page load on a multi-minute
  // first-ever live sync (see fetchDashboard's comment). If the backend
  // itself is unreachable, fall through to the normal fetch/error path below
  // so the user gets the "is the backend running?" message instead.
  try {
    const health = await fetchHealth();
    if (!health.dashboardReady) {
      return <SyncingScreen />;
    }
  } catch {
    // backend unreachable — fetchDashboard below will surface that error
  }

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
