const mongoose = require("mongoose");

const taskSchema = new mongoose.Schema(
{
    title: {
        type: String,
        required: true
    },

    description: String,

    projectId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Project"
    },

    assigneeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    },

    assignedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    },

    priority: {
        type: String,
        enum: ["Low", "Medium", "High", "Critical"],
        default: "Medium"
    },

    status: {
        type: String,
        enum: [
            "Backlog",
            "Todo",
            "In Progress",
            "Review",
            "Done",
            "Completed",
            "Pending",
            "Overdue"
        ],
        default: "Backlog"
    },

    startDate: Date,

    dueDate: Date,

    estimatedHours: Number,

    loggedHours: {
        type: Number,
        default: 0
    },

    progress: {
        type: Number,
        default: 0
    },

    labels: [String],

    checklist: [
        {
            title: String,
            completed: {
                type: Boolean,
                default: false
            }
        }
    ],

    comments: [
        {
            user: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "User"
            },
            message: String,
            createdAt: {
                type: Date,
                default: Date.now
            }
        }
    ],

    attachments: [
        {
            fileName: String,
            fileUrl: String
        }
    ],

    activity: [
        {
            action: String,
            user: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "User"
            },
            createdAt: {
                type: Date,
                default: Date.now
            }
        }
    ]

},
{ timestamps: true });

module.exports = mongoose.model("Task", taskSchema);