const express = require("express");

const router = express.Router();

const {
    createNotification,
    getAllNotifications,
    getNotification,
    markAsRead,
    deleteNotification
} = require("../controllers/NotificationControllers");

router.post("/create", createNotification);

router.get("/get", getAllNotifications);

router.get("/get/:id", getNotification);

router.put("/read/:id", markAsRead);

router.delete("/delete/:id", deleteNotification);

module.exports = router;