const path = require('path');
const express = require('express');
const dotenv = require('dotenv');
const { connectDB } = require('./config/db');
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");

dotenv.config();

// for aws s3 buckets
//______________________________________________
require("dotenv").config();

//___________________________________
const app = express();
const server = http.createServer(app);

// ====================== Socket.io ======================
const io = new Server(server, {
  cors: {
    origin: ["http://localhost:5173", "http://localhost:3000", "http://localhost:4173",
      "https://remainder-frontend.vercel.app"
    ],
    methods: ["GET", "POST"],
    credentials: true,
  },
});

app.set("io", io);

app.use(express.json());
app.use(cors({
  origin: [
    "http://localhost:5173",
    "http://localhost:3000",
    "http://localhost:4173",
    "https://remainder-frontend.vercel.app"
  ],
  credentials: true
}));
app.use(express.json());

//__________________________________________

connectDB();

// ====================== Routes ======================
const userRoutes = require('./routes/UserRoutes');
const TaskRoutes = require('./routes/TaskRoutes');
const RemainderRoutes = require('./routes/RemainderRoutes');
const ProjectRoutes = require('./routes/ProjectRoutes');
const NotificationRoutes = require('./routes/NotificationRoutes');
const DashboardRoutes = require('./routes/DashboardRoutes');
const TaskProgressRoutes = require("./routes/TaskProgressRoutes");
const EmpRoutes = require("./routes/EmpRoutes");
const profileImageRoutes = require("./routes/profileImageRoutes");
const searchRoutes = require("./routes/searchRoutes");
const upload = require("./routes/upload");

app.use('/api/users', userRoutes);
app.use('/api/task', TaskRoutes);
app.use('/api/notification', NotificationRoutes);
app.use('/api/remainder', RemainderRoutes);
app.use('/api/projects', ProjectRoutes);
app.use('/api/dashboard', DashboardRoutes);
app.use("/api/task-p", TaskProgressRoutes);
app.use("/api/performance", EmpRoutes);

require('./jobs/remainderCron');


// baaki imports ke baad
app.use("/api/upload",upload);


app.use("/api/profile-image", profileImageRoutes);
app.use("/api/search", searchRoutes);

app.use("/images", express.static(path.join(__dirname, "public/images/user")));
app.use("/api/settings", require("./routes/systemSettingsRoutes"));

app.get('/', (req, res) => {
  res.send("Server Running");
});

// ====================== Change Streams ======================
const setupChangeStreams = () => {
  try {
    // ========== USERS (Profile, Avatar, Access sab) ==========
    const userStream = mongoose.connection.collection("users").watch([], {
      fullDocument: "updateLookup",
    });

    userStream.on("change", (change) => {
      console.log("👤 User Change →", change.operationType);

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

    userStream.on("error", (err) => console.error("User Stream Error:", err));

    // ========== TASKS ==========
    const Task = mongoose.model("Task");
    const taskStream = Task.watch([], { fullDocument: "updateLookup" });

    taskStream.on("change", (change) => {
      console.log("📌 Task Change →", change.operationType);

      io.emit("notification", {
        type: "task",
        operation: change.operationType,
        data: change.fullDocument || { _id: change.documentKey?._id },
        timestamp: new Date(),
      });

      // Extra clear events
      if (change.operationType === "insert") {
        io.emit("task:created", change.fullDocument);
      }
      if (change.operationType === "update" || change.operationType === "replace") {
        io.emit("task:updated", change.fullDocument);
      }
      if (change.operationType === "delete") {
        io.emit("task:deleted", { taskId: change.documentKey._id.toString() });
      }
    });

    taskStream.on("error", (err) => console.error("Task Stream Error:", err));

    // ========== REMINDERS ==========
    const Reminder = mongoose.model("Reminder");
    const reminderStream = Reminder.watch([], { fullDocument: "updateLookup" });

    reminderStream.on("change", (change) => {
      console.log("🔔 Reminder Change →", change.operationType);

      io.emit("notification", {
        type: "reminder",
        operation: change.operationType,
        data: change.fullDocument || { _id: change.documentKey?._id },
        timestamp: new Date(),
      });

      // Extra clear events
      if (change.operationType === "insert") {
        io.emit("reminder:created", change.fullDocument);
      }
      if (change.operationType === "update" || change.operationType === "replace") {
        io.emit("reminder:updated", change.fullDocument);
      }
      if (change.operationType === "delete") {
        io.emit("reminder:deleted", { reminderId: change.documentKey._id.toString() });
      }
    });

    reminderStream.on("error", (err) => console.error("Reminder Stream Error:", err));

    console.log("✅ Change Streams started successfully (Users + Tasks + Reminders)");
  } catch (error) {
    console.error("❌ Change Stream Error:", error.message);
  }
};

// DB connect hone ke baad streams start karo
mongoose.connection.once("open", () => {
  console.log("✅ MongoDB Connected");
  setupChangeStreams();
});

// ====================== Socket Connection ======================
io.on("connection", (socket) => {
  console.log("🟢 User connected:", socket.id);

  socket.on("join", (userId) => {
    if (userId) {
      socket.join(userId.toString());
      console.log(`User joined room → ${userId}`);
    }
  });

  socket.on("disconnect", () => {
    console.log("🔴 User disconnected:", socket.id);
  });
});

// ====================== Start Server ======================
const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});