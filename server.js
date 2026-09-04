const path = require("path");
const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");

const { connectDB } = require("./config/db");

dotenv.config();

const app = express();
const server = http.createServer(app);

// =====================================================
// CORS CONFIGURATION
// =====================================================

const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:3000",
  "http://localhost:4173",
  "https://remainder-frontend.vercel.app",
];

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests without Origin
      // Example: Postman / server-to-server requests
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      console.log("❌ CORS blocked origin:", origin);
      return callback(new Error("Not allowed by CORS"));
    },

    credentials: true,

    methods: [
      "GET",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
      "OPTIONS",
    ],

    allowedHeaders: [
      "Content-Type",
      "Authorization",
    ],
  })
);

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
// DATABASE
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

app.use("/api/users", userRoutes);

app.use("/api/task", TaskRoutes);

app.use("/api/notification", NotificationRoutes);

app.use("/api/remainder", RemainderRoutes);

app.use("/api/projects", ProjectRoutes);

app.use("/api/dashboard", DashboardRoutes);

app.use("/api/task-p", TaskProgressRoutes);

app.use("/api/performance", EmpRoutes);

app.use("/api/upload", upload);

app.use("/api/profile-image", profileImageRoutes);

app.use("/api/search", searchRoutes);

app.use(
  "/images",
  express.static(
    path.join(__dirname, "public/images/user")
  )
);

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
    // USERS
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
          userId: documentKey._id.toString(),
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
    // TASKS
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
    // REMINDERS
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
      "✅ Change Streams started successfully (Users + Tasks + Reminders)"
    );
  } catch (error) {
    console.error(
      "❌ Change Stream Error:",
      error.message
    );
  }
};

// =====================================================
// DATABASE OPEN → START CHANGE STREAMS
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
// ERROR HANDLER
// =====================================================

app.use((err, req, res, next) => {
  console.error("❌ Server Error:", err.message);

  if (err.message === "Not allowed by CORS") {
    return res.status(403).json({
      success: false,
      message: "CORS Error: Origin not allowed",
    });
  }

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