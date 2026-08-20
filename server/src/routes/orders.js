const express = require("express");
const { getDashboard } = require("../aggregator/buildDashboard");

const router = express.Router();

// GET /api/orders — full merged order list plus KPI summary.
// The dataset is small enough (a few hundred orders) that filtering/search/
// pagination happen client-side; this endpoint just returns everything.
router.get("/", async (req, res, next) => {
  try {
    const { orders, mock } = await getDashboard();
    res.json({ orders, mock });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
