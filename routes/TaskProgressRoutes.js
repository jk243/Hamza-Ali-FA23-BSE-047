const express = require("express");
const router = express.Router();

const {
  getTaskProgress,
} = require("../controllers/TaskProgressControllers");

router.get("/task-progress", getTaskProgress);

module.exports = router;