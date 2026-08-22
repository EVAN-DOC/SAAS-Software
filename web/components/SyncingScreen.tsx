"use client";

import { useEffect, useState } from "react";
import { fetchHealth } from "@/lib/api";

export default function SyncingScreen() {
  const [checks, setChecks] = useState(0);

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const health = await fetchHealth();
        if (health.dashboardReady) {
          window.location.reload();
          return;
        }
      } catch {
        // backend not reachable yet either — keep polling
      }
      setChecks((c) => c + 1);
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
      <div style={{ textAlign: "center", maxWidth: 420, padding: 24 }}>
        <div className="display" style={{ fontSize: 20, marginBottom: 10 }}>
          Syncing your store…
        </div>
        <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6 }}>
          First sync pulls every order from Shopify along with its Cashfree payment status, which can take a few
          minutes under Shopify&apos;s API rate limit. This page will refresh itself automatically once it&apos;s
          ready — no need to keep reloading.
        </div>
        <div style={{ fontSize: 11, color: "var(--faint)", marginTop: 16, fontFamily: "'IBM Plex Mono'" }}>
          checked {checks} time{checks === 1 ? "" : "s"}
        </div>
      </div>
    </div>
  );
}
