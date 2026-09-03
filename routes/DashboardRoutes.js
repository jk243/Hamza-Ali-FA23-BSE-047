const express = require("express");
const router = express.Router();

const {
  getDashboardMetrics,
} = require("../controllers/DashboardControllers");

router.get("/metrics", getDashboardMetrics);

module.exports = router;