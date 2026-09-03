const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    // Personal
    firstname: { type: String, trim: true },
    lastname: { type: String, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    phone: { type: String, default: "" },
    profilePicture: { type: String, default: "" }, // URL / path

    // Professional
    employeeId: { type: String, unique: true, sparse: true },
    role: {
      type: String,
      enum: ["Founder", "HR", "Employee"],
      required: true,
      default: "Employee",
    },
    department: { type: String, default: "" },
    designation: { type: String, default: "" },
    joiningDate: { type: Date },
    manager: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // Account
    password: { type: String, required: true, select: false },
    accountStatus: {
      type: String,
      enum: ["Pending", "Active", "Suspended", "Inactive", "Archived"],
      default: "Pending",
    },
    emailVerified: { type: Boolean, default: false },
    forcePasswordChange: { type: Boolean, default: false },
    temporaryPassword: { type: Boolean, default: false },

    // Permissions (granular)
    // Permissions (granular - only used for HR role)
permissions: {
  userManagement: {
    view: { type: Boolean, default: false },
    add: { type: Boolean, default: false },
    edit: { type: Boolean, default: false },
    delete: { type: Boolean, default: false },
  },
  taskManagement: {
    view: { type: Boolean, default: false },
    add: { type: Boolean, default: false },
    edit: { type: Boolean, default: false },
    delete: { type: Boolean, default: false },
  },
  siteSettings: {
    view: { type: Boolean, default: false },
    add: { type: Boolean, default: false },
    edit: { type: Boolean, default: false },
    delete: { type: Boolean, default: false },
  },
  profile: {
    view: { type: Boolean, default: true },
    add: { type: Boolean, default: false },
    edit: { type: Boolean, default: true },
    delete: { type: Boolean, default: false },
  },
},

    // Security / Login
    lastLogin: { type: Date },
    passwordLastChanged: { type: Date },
    failedLoginAttempts: { type: Number, default: 0 },
    accountLockedUntil: { type: Date, default: null },
    resetPasswordToken: { type: String, default: null },
    resetPasswordExpires: { type: Date, default: null },

    // Meta
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    isDeleted: { type: Boolean, default: false },
  },
  {
    timestamps: true, // createdAt, updatedAt
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtuals
userSchema.virtual("fullName").get(function () {
  return `${this.firstname || ""} ${this.lastname || ""}`.trim();
});

// Hash password before save (async middleware — do NOT call next())
userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  this.password = await bcrypt.hash(this.password, 12);
  this.passwordLastChanged = new Date();
});

// Compare password
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Index for common filters
userSchema.index({ accountStatus: 1, role: 1, department: 1 });
userSchema.index({ email: 1 });
userSchema.index({ employeeId: 1 });

module.exports = mongoose.model("User", userSchema);