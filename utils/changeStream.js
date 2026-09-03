const mongoose = require("mongoose");
const { getIO } = require("./socket");

function startChangeStreams() {
  const io = getIO();
  console.log("🔄 Starting Change Streams...");

  // ========== USERS ==========
  try {
    const userStream = mongoose.connection.collection("users").watch([], {
      fullDocument: "updateLookup",
    });

    userStream.on("change", (change) => {
      console.log("🔥 USER CHANGE →", change.operationType);

      const { operationType, fullDocument, documentKey } = change;

      if (operationType === "insert") {
        io.emit("user:created", fullDocument);
      }
      if (operationType === "update" || operationType === "replace") {
        io.emit("user:updated", fullDocument);
      }
      if (operationType === "delete") {
        io.emit("user:deleted", { userId: documentKey._id.toString() });
      }
    });

    userStream.on("error", (err) => console.error("User Stream Error:", err.message));
    console.log("✅ Users stream started");
  } catch (err) {
    console.error("❌ Users stream failed:", err.message);
  }

  // ========== REMINDERS ==========
  try {
    const reminderStream = mongoose.connection.collection("reminders").watch([], {
      fullDocument: "updateLookup",
    });

    reminderStream.on("change", (change) => {
      console.log("🔥 REMINDER CHANGE →", change.operationType);

      const { operationType, fullDocument, documentKey } = change;

      if (operationType === "insert") {
        io.emit("reminder:created", fullDocument);
      }
      if (operationType === "update" || operationType === "replace") {
        io.emit("reminder:updated", fullDocument);
      }
      if (operationType === "delete") {
        io.emit("reminder:deleted", { reminderId: documentKey._id.toString() });
      }
    });

    reminderStream.on("error", (err) => console.error("Reminder Stream Error:", err.message));
    console.log("✅ Reminders stream started");
  } catch (err) {
    console.error("❌ Reminders stream failed:", err.message);
  }

  // ========== TASKS ==========
  try {
    const taskStream = mongoose.connection.collection("tasks").watch([], {
      fullDocument: "updateLookup",
    });

    taskStream.on("change", (change) => {
      console.log("🔥 TASK CHANGE →", change.operationType);

      const { operationType, fullDocument, documentKey } = change;

      if (operationType === "insert") {
        io.emit("task:created", fullDocument);
      }
      if (operationType === "update" || operationType === "replace") {
        io.emit("task:updated", fullDocument);
      }
      if (operationType === "delete") {
        io.emit("task:deleted", { taskId: documentKey._id.toString() });
      }
    });

    taskStream.on("error", (err) => console.error("Task Stream Error:", err.message));
    console.log("✅ Tasks stream started");
  } catch (err) {
    console.error("❌ Tasks stream failed:", err.message);
  }

  console.log("✅ All Change Streams ready");
}

module.exports = { startChangeStreams };