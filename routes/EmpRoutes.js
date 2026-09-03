const express = require("express");
const router = express.Router();

const empController = require("../controllers/EmpControllers");

// Employee Chart
router.get("/task-status", empController.getTaskStatusChart);

module.exports = router;