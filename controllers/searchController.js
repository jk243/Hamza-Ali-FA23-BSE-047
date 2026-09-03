const Task = require("../models/Task");
const Reminder = require("../models/Remainder");
// Agar User model hai to uncomment karo
// const User = require("../models/User");

exports.globalSearch = async (req, res) => {
  try {
    const q = (req.query.q || "").trim();

    if (!q || q.length < 1) {
      return res.status(200).json({
        success: true,
        data: [],
      });
    }

    const regex = new RegExp(q, "i"); // case-insensitive

    // ---------- Tasks search ----------
    const tasks = await Task.find({
      $or: [
        { title: regex },
        { description: regex },
        { labels: regex },
        { status: regex },
        { priority: regex },
      ],
    })
      .select("title description status priority dueDate")
      .limit(10)
      .lean();

    const taskResults = tasks.map((t) => ({
      id: t._id.toString(),
      title: t.title,
      type: "task",
      path: `/Task-portal?taskId=${t._id}`, // apne actual task detail path se replace karo
      subtitle: `${t.status || ""} • ${t.priority || ""}${
        t.dueDate ? ` • Due: ${new Date(t.dueDate).toLocaleDateString()}` : ""
      }`,
    }));

    // ---------- Reminders search ----------
    const reminders = await Reminder.find({
      $or: [
        { message: regex },
        { status: regex },
        { frequency: regex },
        { notificationType: regex },
      ],
    })
      .populate("taskId", "title")
      .select("message status frequency notificationType reminderDate taskId")
      .limit(10)
      .lean();

    const reminderResults = reminders.map((r) => ({
      id: r._id.toString(),
      title: r.message?.slice(0, 60) || "Reminder",
      type: "reminder",
      path: `/Task-portal?reminderId=${r._id}`, // apne actual path se replace karo
      subtitle: `${r.status || ""} • ${r.frequency || ""} • ${
        r.taskId?.title ? `Task: ${r.taskId.title}` : ""
      }`,
    }));

    // ---------- Optional: Users search (agar chahiye) ----------
    // const users = await User.find({
    //   $or: [
    //     { firstname: regex },
    //     { lastname: regex },
    //     { email: regex },
    //     { name: regex },
    //   ],
    // })
    //   .select("firstname lastname email role name")
    //   .limit(8)
    //   .lean();
    //
    // const userResults = users.map((u) => ({
    //   id: u._id.toString(),
    //   title: `${u.firstname || ""} ${u.lastname || ""}`.trim() || u.name || u.email,
    //   type: "user",
    //   path: `/profile/${u._id}`,
    //   subtitle: u.email || u.role || "",
    // }));

    // Final combined list (tasks pehle, phir reminders)
    const data = [
      ...taskResults,
      ...reminderResults,
      // ...userResults,
    ];

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (err) {
    console.error("globalSearch error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Search failed",
    });
  }
};