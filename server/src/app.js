const express = require("express");
const cors = require("cors");
const config = require("./config");
const ordersRouter = require("./routes/orders");
const kpisRouter = require("./routes/kpis");
const shipmentsRouter = require("./routes/shipments");
const manualOrdersRouter = require("./routes/manualOrders");
const shopifyAuthRouter = require("./routes/shopifyAuth");
const icarryWebhooksRouter = require("./routes/icarryWebhooks");
const shopifyWebhooksRouter = require("./routes/shopifyWebhooks");
const { isWarm } = require("./lib/cache");

const app = express();

app.use(cors({ origin: config.corsOrigin }));
// Captures the exact raw bytes alongside the parsed body — Shopify's webhook
// HMAC (see routes/shopifyWebhooks.js) is signed over the raw request body,
// and re-serializing req.body with JSON.stringify isn't guaranteed to match
// byte-for-byte (key order, spacing), which would make verification fail.
app.use(express.json({ verify: (req, _res, buf) => { req.rawBody = buf; } }));
// iCarry's status/weight-dispute webhooks POST form-encoded ($_POST-style)
// bodies, not JSON — same PHP backend quirk as their regular API.
app.use(express.urlencoded({ extended: true }));

app.get("/health", (req, res) =>
  res.json({ ok: true, mock: config.mockMode, dashboardReady: config.mockMode || isWarm("dashboard") })
);

app.use("/api/orders", ordersRouter);
app.use("/api/kpis", kpisRouter);
app.use("/api/shipments", shipmentsRouter);
app.use("/api/manual-orders", manualOrdersRouter);
app.use("/auth", shopifyAuthRouter);
app.use("/webhooks/icarry", icarryWebhooksRouter);
app.use("/webhooks/shopify", shopifyWebhooksRouter);

app.use((req, res) => res.status(404).json({ error: "Not found" }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || "Internal server error" });
});

module.exports = app;
