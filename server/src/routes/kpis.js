const express = require("express");
const { getDashboard } = require("../aggregator/buildDashboard");

const router = express.Router();

// GET /api/kpis — just the summary row, for widgets that don't need the full list.
router.get("/", async (req, res, next) => {
  try {
    const { kpis, mock } = await getDashboard();
    res.json({ kpis, mock });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
