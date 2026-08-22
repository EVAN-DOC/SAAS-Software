const express = require("express");
const cors = require("cors");
const config = require("./config");
const ordersRouter = require("./routes/orders");
const kpisRouter = require("./routes/kpis");
const shopifyAuthRouter = require("./routes/shopifyAuth");
const icarryWebhooksRouter = require("./routes/icarryWebhooks");
const { isWarm } = require("./lib/cache");

const app = express();

app.use(cors({ origin: config.corsOrigin }));
app.use(express.json());
// iCarry's status/weight-dispute webhooks POST form-encoded ($_POST-style)
// bodies, not JSON — same PHP backend quirk as their regular API.
app.use(express.urlencoded({ extended: true }));

app.get("/health", (req, res) =>
  res.json({ ok: true, mock: config.mockMode, dashboardReady: config.mockMode || isWarm("dashboard") })
);

app.use("/api/orders", ordersRouter);
app.use("/api/kpis", kpisRouter);
app.use("/auth", shopifyAuthRouter);
app.use("/webhooks/icarry", icarryWebhooksRouter);

app.use((req, res) => res.status(404).json({ error: "Not found" }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || "Internal server error" });
});

module.exports = app;
