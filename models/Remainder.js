const mongoose = require("mongoose");

const reminderSchema = new mongoose.Schema(
  {
    taskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Task",
      required: true,
    },
    reminderDate: {
      type: Date,
      required: true,
    },
    frequency: {
      type: String,
      enum: ["Once", "Daily", "Weekly", "Monthly", "Custom"],
      default: "Once",
    },
    customInterval: {
      type: Number,
      default: null,
    },
    customIntervalUnit: {
      type: String,
      enum: ["minutes", "hours", "days", null],
      default: null,
    },
    notificationType: {
      type: String,
      enum: ["Email", "WhatsApp", "Both"],
      default: "Both",
    },
    message: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["Pending", "Sent", "Completed", "Failed"],
      default: "Pending",
    },
    autoType: {
      type: String,
      enum: ["before-due", "on-due", null],
      default: null,
    },
    lastSent: {
      type: Date,
      default: null,
    },
    sentCount: {
      type: Number,
      default: 0,
    },
    deliveryLog: [
      {
        sentAt: {
          type: Date,
          default: Date.now,
        },
        channel: {
          type: String,
          enum: ["Email", "WhatsApp", "Both"],
        },
        status: {
          type: String,
          enum: ["Success", "Failed"],
          default: "Success",
        },
        error: {
          type: String,
          default: null,
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

reminderSchema.index(
  { taskId: 1, reminderDate: 1, notificationType: 1, frequency: 1, autoType: 1 },
  { unique: true }
);

module.exports = mongoose.model("Reminder", reminderSchema);