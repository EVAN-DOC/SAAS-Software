# OneScreen — Merchant Dashboard

Orders, payments and shipping merged from **Shopify**, **Cashfree** and **iCarry** into one screen — a Next.js frontend backed by an Express API.

```
server/   Express API — talks to Shopify/Cashfree/iCarry, merges into one order shape
web/      Next.js (App Router, TypeScript) — renders the dashboard from that API
```

## Quick start (mock data, no credentials needed)

```bash
# terminal 1
cd server
cp .env.example .env      # MOCK_MODE=true by default
npm install
npm run dev                # http://localhost:4000

# terminal 2
cd web
cp .env.local.example .env.local
npm install
npm run dev                # http://localhost:3000
```

Open http://localhost:3000 — you'll see the full dashboard (KPIs, filters, search,
expandable order rows) running against 100 generated sample orders, so you can
review the UI before wiring in real accounts.

## Going live: connecting your real accounts

Set `MOCK_MODE=false` in `server/.env` and fill in:

### Shopify
Admin → Settings → Apps and sales channels → Develop apps → create an app,
grant it `read_orders`, `read_customers`, `read_fulfillments`, install it,
copy the Admin API access token into `SHOPIFY_ACCESS_TOKEN`.
Fully implemented in [`server/src/services/shopifyService.js`](server/src/services/shopifyService.js)
against the documented Admin REST API (cursor-paginated order fetch).

### Cashfree
Dashboard → Developers → API Keys → copy Client ID / Secret. Endpoints used
(verified against current Cashfree docs) are in
[`server/src/services/cashfreeService.js`](server/src/services/cashfreeService.js):
payments-for-order, settlements-for-order, and the bulk settlement
reconciliation endpoint.

### iCarry
iCarry doesn't publish a public API reference — access and the exact
request/response shape come from your merchant panel (Settings → API) or
their support team. [`server/src/services/icarryService.js`](server/src/services/icarryService.js)
is scaffolded with the endpoint shapes iCarry describes on their site (book
shipment / track shipment / sync status) but is **marked TODO and unverified**
— update `ICARRY_BASE_URL` and the paths in that file once you have the real
contract from iCarry.

### Joining the three systems
Orders are matched across all three by the **Shopify order name** (e.g.
`#5001`). Make sure that's the value you pass as the `order_id` when creating
the Cashfree payment session, and as the reference when booking the iCarry
shipment — see `mapOrder()` in
[`server/src/aggregator/mapOrder.js`](server/src/aggregator/mapOrder.js) for
exactly how the join and the money-breakdown legs are built, including the
prepaid / COD / partial-COD classification logic (partial-COD detection
relies on an order tag or note attribute — adjust `classifyOrderType()` to
match whatever partial-COD checkout app this store actually uses).

## What's not wired up yet

- **WhatsApp alerts** — the mockup shows alerts for stuck/NDR orders, but
  WhatsApp wasn't one of the three requested integrations, so `wa` is left
  `null` in live mode. The alert *conditions* (unfulfilled >24h, NDR, RTO)
  are already computed via `shipCat`; wiring a WhatsApp Business/Cloud API
  call is a small addition to `buildDashboard.js` if you want it.
- **Live tracking links** — `order.trackingUrl` is populated from iCarry's
  response once that integration is confirmed; until then the "Track Order"
  button stays disabled.
- **Security**: `next` is pinned to 14.2.35 (latest 14.x patch) rather than
  the current major (16.x) to keep the App Router code in this repo working
  unmodified. Run `npm audit` in `web/` before shipping to production and
  plan an upgrade — several of the flagged advisories are self-hosted-server
  DoS/SSRF issues that matter once this is deployed somewhere reachable from
  the internet.

## API

`GET /api/orders` → `{ orders: Order[], mock: boolean }`
`GET /api/kpis` → `{ kpis: Kpi[], mock: boolean }`
`GET /health` → `{ ok: true, mock: boolean }`

Responses are cached in-memory for `CACHE_TTL_SECONDS` (default 60s) so the
dashboard doesn't re-hit all three upstream APIs on every page load.
