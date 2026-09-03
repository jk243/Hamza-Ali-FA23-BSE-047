const mongoose = require("mongoose");
const Reminder = require("../models/Remainder");
const Task = require("../models/Task");
const { ensureAutoRemindersAfterUserReminder } = require("../services/remainderservice");

// ==============================
// Create Reminder
// ==============================
exports.createReminder = async (req, res) => {
    try {

        const {
            taskId,
            reminderDate,
            frequency,
            notificationType,
            message,
            customInterval,
            customIntervalUnit
        } = req.body;

        // --- Validation ---
        if (!taskId) {
            return res.status(400).json({
                success: false,
                message: "Task ID is required"
            });
        }

        if (!mongoose.Types.ObjectId.isValid(taskId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid Task ID"
            });
        }

        if (!reminderDate) {
            return res.status(400).json({
                success: false,
                message: "Reminder date is required"
            });
        }

        if (new Date(reminderDate) < new Date(new Date().toDateString())) {
            return res.status(400).json({
                success: false,
                message: "Reminder date must be in the future"
            });
        }

        if (!message || message.trim().length === 0) {
            return res.status(400).json({
                success: false,
                message: "Message is required"
            });
        }

        const validFrequencies = ["Once", "Daily", "Weekly", "Monthly", "Custom"];
        if (frequency && !validFrequencies.includes(frequency)) {
            return res.status(400).json({
                success: false,
                message: `Invalid frequency. Must be one of: ${validFrequencies.join(", ")}`
            });
        }

        const validTypes = ["Email", "WhatsApp", "Both"];
        if (notificationType && !validTypes.includes(notificationType)) {
            return res.status(400).json({
                success: false,
                message: `Invalid notification type. Must be one of: ${validTypes.join(", ")}`
            });
        }

        // Validate custom interval fields
        if (frequency === "Custom") {
            if (!customInterval || !customIntervalUnit) {
                return res.status(400).json({
                    success: false,
                    message: "Custom interval requires both customInterval (number) and customIntervalUnit (minutes/hours/days)"
                });
            }
            const validUnits = ["minutes", "hours", "days"];
            if (!validUnits.includes(customIntervalUnit)) {
                return res.status(400).json({
                    success: false,
                    message: `customIntervalUnit must be one of: ${validUnits.join(", ")}`
                });
            }
        }

        // --- Duplicate Prevention ---
        const existingReminder = await Reminder.findOne({
            taskId: taskId,
            reminderDate: new Date(reminderDate),
            notificationType: notificationType || "Both",
            frequency: frequency || "Once",
            status: { $in: ["Pending", "Sent"] }
        });

        if (existingReminder) {
            return res.status(409).json({
                success: false,
                message: "A reminder with the same task, date, and type already exists"
            });
        }

        // --- Create Reminder ---
        const reminderData = {
            taskId: taskId,
            reminderDate: new Date(reminderDate),
            frequency: frequency || "Once",
            notificationType: notificationType || "Both",
            message: message.trim(),
            status: "Pending"
        };

        if (frequency === "Custom") {
            reminderData.customInterval = customInterval;
            reminderData.customIntervalUnit = customIntervalUnit;
        }

        const reminder = await Reminder.create(reminderData);

        // --- Trigger BEFORE-DUE + ON-DUE for this specific task ---
        // This is what was missing: without this call, no auto reminders
        // ever get created, so "before due" (and the system on-due) never fire.
        try {
            const task = await Task.findById(taskId);
            if (task && task.dueDate) {
                await ensureAutoRemindersAfterUserReminder(task, {
                    notificationType: reminderData.notificationType,
                });
            } else {
                console.warn(
                    `⚠️ Skipped auto before-due/on-due: task ${taskId} not found or has no dueDate`
                );
            }
        } catch (autoErr) {
            // Don't fail the whole request just because auto-reminder creation
            // had an issue — the user's manual reminder is already saved.
            console.error(
                `❌ Failed to create auto before-due/on-due for task ${taskId}: ${autoErr.message}`
            );
        }

        res.status(201).json({

            success: true,

            message: "Reminder Created Successfully",

            reminder

        });

    } catch (error) {

        // Handle duplicate key error from MongoDB unique index
        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: "A duplicate reminder already exists for this task, date, and type"
            });
        }

        res.status(500).json({

            success: false,

            message: error.message

        });

    }
};

// ==============================
// Get Reminders of Single Task
// ==============================
exports.getTaskReminders = async (req, res) => {

    try {

        const { taskId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(taskId)) {

            return res.status(400).json({

                success: false,

                message: "Invalid Task ID"

            });

        }

        const reminders = await Reminder.find({

            taskId

        }).sort({

            reminderDate: 1

        });

        res.status(200).json({

            success: true,

            count: reminders.length,

            reminders

        });

    } catch (error) {

        res.status(500).json({

            success: false,

            message: error.message

        });

    }

};

// ==============================
// Get All Reminders
// ==============================
exports.getAllReminders = async (req, res) => {

    try {

        const reminders = await Reminder.find()

            .populate({

                path: "taskId",

                select: "title dueDate priority status assigneeId assignedBy"

            })

            .sort({

                reminderDate: 1

            });

        res.status(200).json({

            success: true,

            count: reminders.length,

            reminders

        });

    } catch (error) {

        res.status(500).json({

            success: false,

            message: error.message

        });

    }

};

// ==============================
// Update Reminder
// ==============================
exports.updateReminder = async (req, res) => {

    try {

        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {

            return res.status(400).json({

                success: false,

                message: "Invalid Reminder ID"

            });

        }

        const reminder = await Reminder.findByIdAndUpdate(

            id,

            req.body,

            {

                new: true,

                runValidators: true

            }

        );

        if (!reminder) {

            return res.status(404).json({

                success: false,

                message: "Reminder Not Found"

            });

        }

        res.status(200).json({

            success: true,

            message: "Reminder Updated Successfully",

            reminder

        });

    } catch (error) {

        res.status(500).json({

            success: false,

            message: error.message

        });

    }

};

// ==============================
// Delete Reminder
// ==============================
exports.deleteReminder = async (req, res) => {

    try {

        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {

            return res.status(400).json({

                success: false,

                message: "Invalid Reminder ID"

            });

        }

        const reminder = await Reminder.findByIdAndDelete(id);

        if (!reminder) {

            return res.status(404).json({

                success: false,

                message: "Reminder Not Found"

            });

        }

        res.status(200).json({

            success: true,

            message: "Reminder Deleted Successfully"

        });

    } catch (error) {

        res.status(500).json({

            success: false,

            message: error.message

        });

    }

};

// ==============================
// Today's Reminders
// ==============================
exports.getTodayReminders = async (req, res) => {

    try {

        const start = new Date();
        start.setHours(0, 0, 0, 0);

        const end = new Date();
        end.setHours(23, 59, 59, 999);

        const reminders = await Reminder.find({

            reminderDate: {

                $gte: start,

                $lte: end

            }

        }).populate({

            path: "taskId",

            select: "title dueDate status assigneeId assignedBy"

        });

        res.status(200).json({

            success: true,

            reminders

        });

    } catch (error) {

        res.status(500).json({

            success: false,

            message: error.message

        });

    }

};