const path = require("path");
const express = require("express");
const dotenv = require("dotenv");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const cors = require("cors");
const { connectDB } = require("./config/db");

dotenv.config();

const app = express();
const server = http.createServer(app);

// =====================================================
// ALLOWED FRONTEND ORIGINS
// =====================================================



// =====================================================
// CORS CONFIGURATION
// =====================================================


const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:3000",
  "http://localhost:4173",
  "https://remainder-frontend.vercel.app",
];

// 1. Create robust CORS middleware
const corsMiddleware = cors({
  origin: (origin, callback) => {
    // If no origin (e.g. Server-to-Server, Postman, Mobile) or origin is allowed
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(null, false); // Return false instead of throwing an Error
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 200,
});

// 2. MUST BE APPLIED BEFORE ANY ROUTES OR MIDDLEWARE
app.use(corsMiddleware);

// =====================================================
// BODY PARSER
// =====================================================

app.use(express.json());

// =====================================================
// SOCKET.IO
// =====================================================

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

app.set("io", io);

// =====================================================
// DATABASE CONNECTION
// =====================================================

connectDB();

// =====================================================
// ROUTES
// =====================================================

const userRoutes = require("./routes/UserRoutes");
const TaskRoutes = require("./routes/TaskRoutes");
const RemainderRoutes = require("./routes/RemainderRoutes");
const ProjectRoutes = require("./routes/ProjectRoutes");
const NotificationRoutes = require("./routes/NotificationRoutes");
const DashboardRoutes = require("./routes/DashboardRoutes");
const TaskProgressRoutes = require("./routes/TaskProgressRoutes");
const EmpRoutes = require("./routes/EmpRoutes");
const profileImageRoutes = require("./routes/profileImageRoutes");
const searchRoutes = require("./routes/searchRoutes");
const upload = require("./routes/upload");

// Users
app.use("/api/users", userRoutes);

// Tasks
app.use("/api/task", TaskRoutes);

// Notifications
app.use("/api/notification", NotificationRoutes);

// Reminders
app.use("/api/remainder", RemainderRoutes);

// Projects
app.use("/api/projects", ProjectRoutes);

// Dashboard
app.use("/api/dashboard", DashboardRoutes);

// Task Progress
app.use("/api/task-p", TaskProgressRoutes);

// Employee Performance
app.use("/api/performance", EmpRoutes);

// Upload
app.use("/api/upload", upload);

// Profile Images
app.use("/api/profile-image", profileImageRoutes);

// Search
app.use("/api/search", searchRoutes);

// User Images
app.use(
  "/images",
  express.static(
    path.join(__dirname, "public/images/user")
  )
);

// System Settings
app.use(
  "/api/settings",
  require("./routes/systemSettingsRoutes")
);

// =====================================================
// REMINDER CRON
// =====================================================

require("./jobs/remainderCron");

// =====================================================
// ROOT ROUTE
// =====================================================

app.get("/", (req, res) => {
  res.status(200).send("Server Running");
});

// =====================================================
// CHANGE STREAMS
// =====================================================

const setupChangeStreams = () => {
  try {
    // =================================================
    // USERS CHANGE STREAM
    // =================================================

    const userStream = mongoose.connection
      .collection("users")
      .watch([], {
        fullDocument: "updateLookup",
      });

    userStream.on("change", (change) => {
      console.log(
        "👤 User Change →",
        change.operationType
      );

      const {
        operationType,
        fullDocument,
        documentKey,
      } = change;

      if (operationType === "insert") {
        io.emit("user:created", fullDocument);
      }

      if (
        operationType === "update" ||
        operationType === "replace"
      ) {
        io.emit("user:updated", fullDocument);
      }

      if (operationType === "delete") {
        io.emit("user:deleted", {
          userId: documentKey?._id?.toString(),
        });
      }
    });

    userStream.on("error", (err) => {
      console.error(
        "❌ User Stream Error:",
        err
      );
    });

    // =================================================
    // TASK CHANGE STREAM
    // =================================================

    const Task = mongoose.model("Task");

    const taskStream = Task.watch([], {
      fullDocument: "updateLookup",
    });

    taskStream.on("change", (change) => {
      console.log(
        "📌 Task Change →",
        change.operationType
      );

      io.emit("notification", {
        type: "task",
        operation: change.operationType,
        data:
          change.fullDocument || {
            _id: change.documentKey?._id,
          },
        timestamp: new Date(),
      });

      if (change.operationType === "insert") {
        io.emit(
          "task:created",
          change.fullDocument
        );
      }

      if (
        change.operationType === "update" ||
        change.operationType === "replace"
      ) {
        io.emit(
          "task:updated",
          change.fullDocument
        );
      }

      if (change.operationType === "delete") {
        io.emit("task:deleted", {
          taskId:
            change.documentKey?._id?.toString(),
        });
      }
    });

    taskStream.on("error", (err) => {
      console.error(
        "❌ Task Stream Error:",
        err
      );
    });

    // =================================================
    // REMINDER CHANGE STREAM
    // =================================================

    const Reminder = mongoose.model("Reminder");

    const reminderStream = Reminder.watch([], {
      fullDocument: "updateLookup",
    });

    reminderStream.on("change", (change) => {
      console.log(
        "🔔 Reminder Change →",
        change.operationType
      );

      io.emit("notification", {
        type: "reminder",
        operation: change.operationType,
        data:
          change.fullDocument || {
            _id: change.documentKey?._id,
          },
        timestamp: new Date(),
      });

      if (change.operationType === "insert") {
        io.emit(
          "reminder:created",
          change.fullDocument
        );
      }

      if (
        change.operationType === "update" ||
        change.operationType === "replace"
      ) {
        io.emit(
          "reminder:updated",
          change.fullDocument
        );
      }

      if (change.operationType === "delete") {
        io.emit("reminder:deleted", {
          reminderId:
            change.documentKey?._id?.toString(),
        });
      }
    });

    reminderStream.on("error", (err) => {
      console.error(
        "❌ Reminder Stream Error:",
        err
      );
    });

    console.log(
      "✅ Change Streams started successfully"
    );
  } catch (error) {
    console.error(
      "❌ Change Stream Error:",
      error.message
    );
  }
};

// =====================================================
// START CHANGE STREAMS AFTER MONGODB CONNECTION
// =====================================================

mongoose.connection.once("open", () => {
  console.log("✅ MongoDB Connected");

  setupChangeStreams();
});

// =====================================================
// SOCKET CONNECTION
// =====================================================

io.on("connection", (socket) => {
  console.log(
    "🟢 User connected:",
    socket.id
  );

  socket.on("join", (userId) => {
    if (userId) {
      socket.join(userId.toString());

      console.log(
        `User joined room → ${userId}`
      );
    }
  });

  socket.on("disconnect", () => {
    console.log(
      "🔴 User disconnected:",
      socket.id
    );
  });
});

// =====================================================
// GLOBAL ERROR HANDLER
// =====================================================

app.use((err, req, res, next) => {
  console.error(
    "❌ Server Error:",
    err.message
  );

  res.status(500).json({
    success: false,
    message: "Internal Server Error",
  });
});

// =====================================================
// START SERVER
// =====================================================

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(
    `🚀 Server running on port ${PORT}`
  );
});