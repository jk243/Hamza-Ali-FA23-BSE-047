const express = require("express");
const router = express.Router();

const reminderController = require("../controllers/RemainderControllers");

router.post("/create", reminderController.createReminder);

router.get("/task/:taskId", reminderController.getTaskReminders);

router.get("/all", reminderController.getAllReminders);

router.get("/today", reminderController.getTodayReminders);

router.put("/:id", reminderController.updateReminder);

router.delete("/:id", reminderController.deleteReminder);

module.exports = router;
