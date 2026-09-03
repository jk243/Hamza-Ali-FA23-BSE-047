const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
{
    receiverId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },

    senderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },

    taskId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Task",
        default: null
    },

    reminderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Reminder",
        default: null
    },

    projectId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Project",
        default: null
    },

    title: {
        type: String,
        required: true
    },

    message: {
        type: String,
        required: true
    },

    type: {
        type: String,
        enum: [
            "Task Assigned",
            "Task Updated",
            "Task Completed",
            "Reminder",
            "Project",
            "General"
        ],
        default: "General"
    },

    isRead: {
        type: Boolean,
        default: false
    }

},
{
    timestamps: true
});

module.exports = mongoose.model("Notification", notificationSchema);