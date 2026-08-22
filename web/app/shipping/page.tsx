import ShippingDashboard from "@/components/ShippingDashboard";
import SyncingScreen from "@/components/SyncingScreen";
import { fetchHealth, fetchShippingList } from "@/lib/api";

export default async function ShippingPage() {
  try {
    const health = await fetchHealth();
    if (!health.dashboardReady) {
      return <SyncingScreen />;
    }
  } catch {
    // backend unreachable — fetchShippingList below will surface that error
  }

  let shipments: Awaited<ReturnType<typeof fetchShippingList>>["shipments"] = [];
  let mock = false;
  let bookingEnabled = false;
  let loadError: string | null = null;

  try {
    const data = await fetchShippingList();
    shipments = data.shipments;
    mock = data.mock;
    bookingEnabled = data.bookingEnabled;
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Could not reach the API server";
  }

  return <ShippingDashboard initialShipments={shipments} mock={mock} bookingEnabled={bookingEnabled} loadError={loadError} />;
}
