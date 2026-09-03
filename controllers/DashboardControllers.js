const User = require("../models/User");
const Task = require("../models/Task");
const Reminder = require("../models/Remainder");
const Notification = require("../models/Notification");

exports.getDashboardMetrics = async (req, res) => {
  try {
    const totalEmployees = await User.countDocuments({
      
    });

    const activeEmployees = await User.countDocuments({
      status: "Active",
    });

    const totalTasks = await Task.countDocuments();

    const pendingTasks = await Task.countDocuments({
      status: "Pending",
    });

    const inProgressTasks = await Task.countDocuments({
      status: "In Progress",
    });

    const completedTasks = await Task.countDocuments({
      status: "Completed",
    });

    const overdueTasks = await Task.countDocuments({
      status: "Overdue",
    });

    const todayReminders = await Reminder.countDocuments();

    const totalNotifications = await Notification.countDocuments();

    const completionRate =
      totalTasks === 0
        ? 0
        : Math.round((completedTasks / totalTasks) * 100);

    res.json({
      totalEmployees,
      activeEmployees,
      totalTasks,
      pendingTasks,
      inProgressTasks,
      completedTasks,
      overdueTasks,
      todayReminders,
      totalNotifications,
      completionRate,
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};