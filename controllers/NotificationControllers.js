const Notification = require("../models/Notification");

// ==============================
// Create Notification
// ==============================
exports.createNotification = async (req, res) => {
    try {

        const notification = await Notification.create(req.body);

        res.status(201).json({
            success: true,
            message: "Notification created successfully",
            notification
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            message: error.message
        });

    }
};

// ==============================
// Get All Notifications
// ==============================
exports.getAllNotifications = async (req, res) => {
    try {

        const notifications = await Notification.find()
            .populate("receiverId", "name email")
            .populate("senderId", "name email")
            .populate("taskId", "title status")
            .populate("projectId", "name")
            .populate("reminderId", "title reminderDate")
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            count: notifications.length,
            notifications
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            message: error.message
        });

    }
};

// ==============================
// Get Notification By Id
// ==============================
exports.getNotification = async (req, res) => {
    try {

        const notification = await Notification.findById(req.params.id)
            .populate("receiverId", "name email")
            .populate("senderId", "name email")
            .populate("taskId", "title status")
            .populate("projectId", "name")
            .populate("reminderId", "title reminderDate");

        if (!notification) {

            return res.status(404).json({
                success: false,
                message: "Notification not found"
            });

        }

        res.status(200).json({
            success: true,
            notification
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            message: error.message
        });

    }
};

// ==============================
// Mark Notification As Read
// ==============================
exports.markAsRead = async (req, res) => {
    try {

        const notification = await Notification.findByIdAndUpdate(

            req.params.id,

            {
                isRead: true
            },

            {
                new: true
            }

        );

        if (!notification) {

            return res.status(404).json({
                success: false,
                message: "Notification not found"
            });

        }

        res.status(200).json({
            success: true,
            message: "Notification marked as read",
            notification
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            message: error.message
        });

    }
};

// ==============================
// Delete Notification
// ==============================
exports.deleteNotification = async (req, res) => {
    try {

        const notification = await Notification.findByIdAndDelete(req.params.id);

        if (!notification) {

            return res.status(404).json({
                success: false,
                message: "Notification not found"
            });

        }

        res.status(200).json({
            success: true,
            message: "Notification deleted successfully"
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            message: error.message
        });

    }
};