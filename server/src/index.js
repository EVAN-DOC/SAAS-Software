const app = require("./app");
const config = require("./config");
const { getDashboard } = require("./aggregator/buildDashboard");

app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "SAAS Software API is running",
  });
});

const server = app.listen(config.port, () => {
  console.log(`OneScreen API listening on http://localhost:${config.port} (mock mode: ${config.mockMode})`);

  if (!config.mockMode) {
    // A full live sync can take several minutes (hundreds of orders, each
    // needing its own Shopify/Cashfree lookups under Shopify's rate limit).
    // Warm the cache at boot instead of making the first dashboard load
    // block on it and risk timing out client-side.
    console.log("Warming dashboard cache (this can take a few minutes on first boot)...");
    const startedAt = Date.now();
    getDashboard()
      .then((d) => console.log(`Cache warm: ${d.orders.length} orders in ${Math.round((Date.now() - startedAt) / 1000)}s`))
      .catch((err) => console.error("Cache warmup failed:", err.message));
  }
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `\nPort ${config.port} is already in use — a server is likely already running.\n` +
        `Check http://localhost:${config.port}/health in a browser: if it responds, you're already good to go and don't need to start another one.\n` +
        `If it doesn't respond, something else (not this app) is holding the port — free it up and try again.\n`
    );
    process.exit(1);
  }
  throw err;
});
