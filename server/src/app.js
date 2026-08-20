const express = require("express");
const cors = require("cors");
const config = require("./config");
const ordersRouter = require("./routes/orders");
const kpisRouter = require("./routes/kpis");
const shopifyAuthRouter = require("./routes/shopifyAuth");

const app = express();

app.use(cors({ origin: config.corsOrigin }));
app.use(express.json());

app.get("/health", (req, res) => res.json({ ok: true, mock: config.mockMode }));

app.use("/api/orders", ordersRouter);
app.use("/api/kpis", kpisRouter);
app.use("/auth", shopifyAuthRouter);

app.use((req, res) => res.status(404).json({ error: "Not found" }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || "Internal server error" });
});

module.exports = app;
