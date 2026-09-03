const User = require("../models/User");
const AuditLog = require("../models/Auditlog");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { sendReminderEmail } = require("../services/emailService");

// Helper: create audit log
const createAuditLog = async ({
  action,
  performedBy,
  targetUser,
  previousValue = null,
  newValue = null,
  description = "",
  req = null,
}) => {
  try {
    await AuditLog.create({
      action,
      performedBy,
      targetUser,
      previousValue,
      newValue,
      description,
      ipAddress: req?.ip || req?.headers?.["x-forwarded-for"] || null,
      userAgent: req?.headers?.["user-agent"] || null,
    });
  } catch (err) {
    console.error("Audit log failed:", err.message);
  }
};

// ======================
// REGISTER (kept for backward compatibility / invitation flow)
// ======================
const registerUser = async (req, res) => {
  try {
    const { firstname, lastname, email, password, role } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "Email already registered",
      });
    }

    const user = await User.create({
      firstname,
      lastname,
      email,
      password,
      role: role || "Employee",
      accountStatus: "Pending",
    });

    res.status(201).json({
      success: true,
      message: "User Registered Successfully",
      user: {
        _id: user._id,
        firstname: user.firstname,
        lastname: user.lastname,
        email: user.email,
        role: user.role,
        accountStatus: user.accountStatus,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ======================
// LOGIN (with hashing + status checks)
// ======================
const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email }).select("+password");
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid Email or Password",
      });
    }

    // Account status checks
    if (user.accountStatus === "Suspended") {
      return res.status(403).json({
        success: false,
        message: "Your account has been suspended. Contact admin.",
      });
    }
    if (user.accountStatus === "Inactive" || user.accountStatus === "Archived") {
      return res.status(403).json({
        success: false,
        message: "Your account is inactive. Contact admin.",
      });
    }
    if (user.accountStatus === "Pending") {
      return res.status(403).json({
        success: false,
        message: "Your account is pending activation.",
      });
    }

    // Account lock check
    if (user.accountLockedUntil && user.accountLockedUntil > new Date()) {
      return res.status(403).json({
        success: false,
        message: "Account temporarily locked due to too many failed attempts.",
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
      if (user.failedLoginAttempts >= 5) {
        user.accountLockedUntil = new Date(Date.now() + 30 * 60 * 1000); // 30 min
      }
      await user.save();
      return res.status(401).json({
        success: false,
        message: "Invalid Email or Password",
      });
    }

    // Success
   // Success
user.failedLoginAttempts = 0;
user.accountLockedUntil = null;
user.lastLogin = new Date();
await user.save();

let dashboard = "/Task-portal";

if (user.role === "Founder") {
  dashboard = "/admin-dashboard";
} else if (user.role === "HR") {
  if (user.permissions?.userManagement === true) {
    dashboard = "/User-Management";
  } else {
    dashboard = "/Task-portal";
  }
}

res.status(200).json({
  success: true,
  message: "Login Successful",
  dashboard,
  forcePasswordChange: user.forcePasswordChange,
  user: {
    _id: user._id,
    firstname: user.firstname,
    lastname: user.lastname,
    email: user.email,
    role: user.role,
    accountStatus: user.accountStatus,
    permissions: user.permissions,
    profilePicture: user.profilePicture,
    department: user.department,
    employeeId: user.employeeId,
  },
});
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ======================
// GET ALL USERS (with filters, search, sort, pagination)
// ======================
const getAllUsers = async (req, res) => {
  try {
    const {
      search = "",
      status,
      role,
      department,
      designation,
      workload, // high | normal | low (based on activeTasks - requires Task model integration)
      page = 1,
      limit = 20,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const query = { isDeleted: false };

    // Search
    if (search) {
      const regex = new RegExp(search, "i");
      query.$or = [
        { firstname: regex },
        { lastname: regex },
        { email: regex },
        { phone: regex },
        { employeeId: regex },
      ];
    }

    if (status) query.accountStatus = status;
    if (role) query.role = role;
    if (department) query.department = department;
    if (designation) query.designation = designation;

    const sort = {};
    const allowedSort = [
      "firstname",
      "createdAt",
      "lastLogin",
      "accountStatus",
      "role",
    ];
    if (allowedSort.includes(sortBy)) {
      sort[sortBy] = sortOrder === "asc" ? 1 : -1;
    } else {
      sort.createdAt = -1;
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [users, total] = await Promise.all([
      User.find(query)
        .select("-password -resetPasswordToken -resetPasswordExpires")
        .populate("manager", "firstname lastname email")
        .populate("createdBy", "firstname lastname")
        .sort(sort)
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      User.countDocuments(query),
    ]);

    // Analytics
    const analytics = await User.aggregate([
      { $match: { isDeleted: false } },
      {
        $group: {
          _id: null,
          totalUsers: { $sum: 1 },
          activeUsers: {
            $sum: { $cond: [{ $eq: ["$accountStatus", "Active"] }, 1, 0] },
          },
          pendingUsers: {
            $sum: { $cond: [{ $eq: ["$accountStatus", "Pending"] }, 1, 0] },
          },
          inactiveUsers: {
            $sum: { $cond: [{ $eq: ["$accountStatus", "Inactive"] }, 1, 0] },
          },
          suspendedUsers: {
            $sum: { $cond: [{ $eq: ["$accountStatus", "Suspended"] }, 1, 0] },
          },
          employees: {
            $sum: { $cond: [{ $eq: ["$role", "Employee"] }, 1, 0] },
          },
          hrmUsers: {
            $sum: {
              $cond: [
                { $in: ["$role", ["HRM", "Founder"]] },
                1,
                0,
              ],
            },
          },
        },
      },
    ]);

    res.status(200).json({
      success: true,
      count: users.length,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / Number(limit)),
      analytics: analytics[0] || {
        totalUsers: 0,
        activeUsers: 0,
        pendingUsers: 0,
        inactiveUsers: 0,
        suspendedUsers: 0,
        employees: 0,
        hrmUsers: 0,
      },
      users,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ======================
// GET SINGLE USER (full profile)
// ======================
const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select("-password -resetPasswordToken -resetPasswordExpires")
      .populate("manager", "firstname lastname email role")
      .populate("createdBy", "firstname lastname")
      .lean();

    if (!user || user.isDeleted) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Audit logs for this user
    const auditLogs = await AuditLog.find({ targetUser: user._id })
      .populate("performedBy", "firstname lastname")
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    res.status(200).json({
      success: true,
      user,
      auditLogs,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ======================
// CREATE USER (by HRM / Founder)
// ======================
const createUser = async (req, res) => {
  try {
    const creatorId = req.headers["x-user-id"];
    if (!creatorId) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated",
      });
    }

    const {
      firstname,
      lastname,
      email,
      phone,
      password,
      role,
      department,
      designation,
      employeeId,
      joiningDate,
      manager,
      accountStatus = "Active",
      forcePasswordChange = true,
      temporaryPassword = false,
      permissions,
      profilePicture,
    } = req.body;

    if (!email || !password || !role) {
      return res.status(400).json({
        success: false,
        message: "Email, password and role are required",
      });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: "Email already registered",
      });
    }

    if (employeeId) {
      const empExists = await User.findOne({ employeeId });
      if (empExists) {
        return res.status(400).json({
          success: false,
          message: "Employee ID already exists",
        });
      }
    }

    const user = await User.create({
      firstname,
      lastname,
      email,
      phone,
      password,
      role,
      department,
      designation,
      employeeId,
      joiningDate,
      manager: manager || null,
      accountStatus,
      forcePasswordChange,
      temporaryPassword,
      permissions: permissions || undefined,
      profilePicture: profilePicture || "",
      createdBy: creatorId,
      emailVerified: false,
    });

    await createAuditLog({
      action: "USER_CREATED",
      performedBy: creatorId,
      targetUser: user._id,
      newValue: {
        email: user.email,
        role: user.role,
        accountStatus: user.accountStatus,
      },
      description: `User ${user.fullName} created`,
      req,
    });

    // Optionally send welcome / set-password email
    // (implement with your emailService if needed)

    res.status(201).json({
      success: true,
      message: "User created successfully",
      user: {
        _id: user._id,
        firstname: user.firstname,
        lastname: user.lastname,
        email: user.email,
        role: user.role,
        accountStatus: user.accountStatus,
        employeeId: user.employeeId,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ======================
// UPDATE USER (by HRM / Founder)
// ======================
const updateUser = async (req, res) => {
  try {
    const adminId = req.headers["x-user-id"];
    if (!adminId) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated",
      });
    }

    const userId = req.params.id;
    const user = await User.findById(userId);
    if (!user || user.isDeleted) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const allowedFields = [
      "firstname",
      "lastname",
      "phone",
      "profilePicture",
      "employeeId",
      "role",
      "department",
      "designation",
      "joiningDate",
      "manager",
      "accountStatus",
      "forcePasswordChange",
      "permissions",
      "emailVerified",
    ];

    const previous = {};
    const changes = {};

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        previous[field] = user[field];
        user[field] = req.body[field];
        changes[field] = req.body[field];
      }
    }

    // Email change is special – handled separately
    if (req.body.email && req.body.email !== user.email) {
      const emailTaken = await User.findOne({
        email: req.body.email,
        _id: { $ne: userId },
      });
      if (emailTaken) {
        return res.status(400).json({
          success: false,
          message: "Email already registered to another account",
        });
      }
      previous.email = user.email;
      user.email = req.body.email;
      user.emailVerified = false;
      changes.email = req.body.email;
    }

    await user.save();

    if (Object.keys(changes).length > 0) {
      await createAuditLog({
        action: "PROFILE_UPDATED",
        performedBy: adminId,
        targetUser: userId,
        previousValue: previous,
        newValue: changes,
        description: `Profile updated for ${user.fullName}`,
        req,
      });
    }

    res.status(200).json({
      success: true,
      message: "User updated successfully",
      user: {
        _id: user._id,
        firstname: user.firstname,
        lastname: user.lastname,
        email: user.email,
        role: user.role,
        accountStatus: user.accountStatus,
        department: user.department,
        designation: user.designation,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ======================
// CHANGE ACCOUNT STATUS
// ======================
const changeAccountStatus = async (req, res) => {
  try {
    const adminId = req.headers["x-user-id"];
    if (!adminId) {
      return res.status(401).json({ success: false, message: "Not authenticated" });
    }

    const { status, force = false } = req.body;
    const allowed = ["Pending", "Active", "Suspended", "Inactive", "Archived"];
    if (!allowed.includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid status" });
    }

    const user = await User.findById(req.params.id);
    if (!user || user.isDeleted) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // TODO: Check active tasks before deactivating / suspending
    // if (["Inactive", "Suspended", "Archived"].includes(status) && !force) {
    //   const activeTasks = await Task.countDocuments({ assignedTo: user._id, status: { $in: ["Pending", "In Progress"] } });
    //   if (activeTasks > 0) {
    //     return res.status(400).json({
    //       success: false,
    //       message: "User has active tasks",
    //       activeTasks,
    //       requiresConfirmation: true,
    //     });
    //   }
    // }

    const previousStatus = user.accountStatus;
    user.accountStatus = status;
    await user.save();

    await createAuditLog({
      action: "STATUS_CHANGED",
      performedBy: adminId,
      targetUser: user._id,
      previousValue: previousStatus,
      newValue: status,
      description: `Account status changed from ${previousStatus} to ${status}`,
      req,
    });

    res.status(200).json({
      success: true,
      message: `Account status updated to ${status}`,
      accountStatus: status,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ======================
// RESET PASSWORD (by admin)
// ======================
const adminResetPassword = async (req, res) => {
  try {
    const adminId = req.headers["x-user-id"];
    if (!adminId) {
      return res.status(401).json({ success: false, message: "Not authenticated" });
    }

    const { newPassword, forceChange = true, sendEmail = false } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters",
      });
    }

    const user = await User.findById(req.params.id).select("+password");
    if (!user || user.isDeleted) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    user.password = newPassword;
    user.forcePasswordChange = forceChange;
    user.temporaryPassword = true;
    await user.save();

    await createAuditLog({
      action: "PASSWORD_RESET",
      performedBy: adminId,
      targetUser: user._id,
      description: "Password reset by admin",
      req,
    });

    if (sendEmail) {
      // send temporary password email if desired
    }

    res.status(200).json({
      success: true,
      message: "Password reset successfully",
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ======================
// BULK ACTIONS
// ======================
const bulkUpdateUsers = async (req, res) => {
  try {
    const adminId = req.headers["x-user-id"];
    if (!adminId) {
      return res.status(401).json({ success: false, message: "Not authenticated" });
    }

    const { userIds, action, value } = req.body;
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ success: false, message: "No users selected" });
    }

    let update = {};
    let auditAction = "";

    switch (action) {
      case "activate":
        update = { accountStatus: "Active" };
        auditAction = "BULK_ACTIVATE";
        break;
      case "deactivate":
        update = { accountStatus: "Inactive" };
        auditAction = "BULK_DEACTIVATE";
        break;
      case "suspend":
        update = { accountStatus: "Suspended" };
        auditAction = "BULK_SUSPEND";
        break;
      case "changeRole":
        if (!value) return res.status(400).json({ success: false, message: "Role required" });
        update = { role: value };
        auditAction = "BULK_ROLE_CHANGE";
        break;
      case "changeDepartment":
        if (!value) return res.status(400).json({ success: false, message: "Department required" });
        update = { department: value };
        auditAction = "BULK_DEPARTMENT_CHANGE";
        break;
      default:
        return res.status(400).json({ success: false, message: "Invalid action" });
    }

    const result = await User.updateMany(
      { _id: { $in: userIds }, isDeleted: false },
      { $set: update }
    );

    // Audit for each
    for (const id of userIds) {
      await createAuditLog({
        action: auditAction,
        performedBy: adminId,
        targetUser: id,
        newValue: update,
        description: `Bulk action: ${action}`,
        req,
      });
    }

    res.status(200).json({
      success: true,
      message: `${result.modifiedCount} users updated`,
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ======================
// GET PROFILE (own)
// ======================
const getProfile = async (req, res) => {
  try {
    const userId = req.headers["x-user-id"];
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated: missing user id",
      });
    }

    const user = await User.findById(userId).select("-password");
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    res.status(200).json({ success: true, user });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ======================
// UPDATE PROFILE (own)
// ======================
const updateProfile = async (req, res) => {
  try {
    const userId = req.headers["x-user-id"];
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated: missing user id",
      });
    }

    const { firstname, lastname, email, phone } = req.body;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (email && email !== user.email) {
      const emailTaken = await User.findOne({ email, _id: { $ne: userId } });
      if (emailTaken) {
        return res.status(400).json({
          success: false,
          message: "Email already registered to another account",
        });
      }
      user.email = email;
      user.emailVerified = false;
    }

    if (firstname !== undefined) user.firstname = firstname;
    if (lastname !== undefined) user.lastname = lastname;
    if (phone !== undefined) user.phone = phone;

    await user.save();

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      user: {
        _id: user._id,
        firstname: user.firstname,
        lastname: user.lastname,
        email: user.email,
        role: user.role,
        phone: user.phone,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ======================
// CHANGE PASSWORD (own)
// ======================
const changePassword = async (req, res) => {
  try {
    const userId = req.headers["x-user-id"];
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated: missing user id",
      });
    }

    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Current and new password are required",
      });
    }

    const user = await User.findById(userId).select("+password");
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Current password is incorrect",
      });
    }

    user.password = newPassword;
    user.forcePasswordChange = false;
    user.temporaryPassword = false;
    await user.save();

    res.status(200).json({
      success: true,
      message: "Password changed successfully",
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ======================
// FORGOT / RESET PASSWORD (public)
// ======================
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: "Email is required" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const token = crypto.randomBytes(32).toString("hex");
    user.resetPasswordToken = token;
    user.resetPasswordExpires = Date.now() + 15 * 60 * 1000;
    await user.save();

    const resetLink = `http://localhost:5173/reset-password?token=${token}`;

    const html = `
      <h2>Password Reset Request</h2>
      <p>Hello ${user.firstname},</p>
      <p>You requested to reset your password.</p>
      <p>
        <a href="${resetLink}" style="background:#2563eb;color:#ffffff;padding:12px 20px;text-decoration:none;border-radius:6px;display:inline-block;">
          Reset Password
        </a>
      </p>
      <p>Or copy this link:</p>
      <p>${resetLink}</p>
      <p>This link will expire in 15 minutes.</p>
      <p>If you didn't request this, ignore this email.</p>
    `;

    const result = await sendReminderEmail(
      user.email,
      "Reset Your Password",
      `Reset your password using this link:\n${resetLink}`,
      html
    );

    if (!result.success) {
      return res.status(500).json({ success: false, message: result.error });
    }

    return res.status(200).json({
      success: true,
      message: "Password reset link sent successfully.",
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

const resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;

    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() },
    }).select("+password");

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired token",
      });
    }

    user.password = password;
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    user.forcePasswordChange = false;
    user.temporaryPassword = false;
    await user.save();

    res.json({
      success: true,
      message: "Password reset successfully.",
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ======================
// GET ACTIVE USERS (for task assignment dropdown)
// ======================
const getActiveUsersForAssignment = async (req, res) => {
  try {
    const users = await User.find({
      accountStatus: "Active",
      isDeleted: false,
    })
      .select("firstname lastname email role department designation profilePicture")
      .sort({ firstname: 1 })
      .lean();

    res.status(200).json({ success: true, users });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Soft delete
const deleteUser = async (req, res) => {
  try {
    const adminId = req.headers["x-user-id"];
    if (!adminId) {
      return res.status(401).json({ success: false, message: "Not authenticated" });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    user.isDeleted = true;
    user.accountStatus = "Archived";
    await user.save();

    await createAuditLog({
      action: "USER_DELETED",
      performedBy: adminId,
      targetUser: user._id,
      description: "User soft-deleted / archived",
      req,
    });

    res.status(200).json({ success: true, message: "User archived successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};


//UpdateUserPermissions
// ===================================================================
const updateUserPermissions = async (req, res) => {
  try {
    const adminId = req.headers["x-user-id"];
    if (!adminId) {
      return res.status(401).json({ success: false, message: "Not authenticated" });
    }

    const user = await User.findById(req.params.id);
    if (!user || user.isDeleted) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (user.role !== "HR") {
      return res.status(400).json({
        success: false,
        message: "Permissions can only be managed for HR users",
      });
    }

    const { permissions } = req.body;
    if (!permissions || typeof permissions !== "object") {
      return res.status(400).json({ success: false, message: "Permissions required" });
    }

    // Default structure
    const DEFAULT = {
      userManagement: { view: false, add: false, edit: false, delete: false },
      taskManagement: { view: false, add: false, edit: false, delete: false },
      siteSettings: { view: false, add: false, edit: false, delete: false },
      profile: { view: true, add: false, edit: true, delete: false },
    };

    const previous = user.permissions?.toObject?.() || user.permissions || {};

    // Merge safely
    user.permissions = {
      userManagement: {
        view: permissions.userManagement?.view ?? DEFAULT.userManagement.view,
        add: permissions.userManagement?.add ?? DEFAULT.userManagement.add,
        edit: permissions.userManagement?.edit ?? DEFAULT.userManagement.edit,
        delete: permissions.userManagement?.delete ?? DEFAULT.userManagement.delete,
      },
      taskManagement: {
        view: permissions.taskManagement?.view ?? DEFAULT.taskManagement.view,
        add: permissions.taskManagement?.add ?? DEFAULT.taskManagement.add,
        edit: permissions.taskManagement?.edit ?? DEFAULT.taskManagement.edit,
        delete: permissions.taskManagement?.delete ?? DEFAULT.taskManagement.delete,
      },
      siteSettings: {
        view: permissions.siteSettings?.view ?? DEFAULT.siteSettings.view,
        add: permissions.siteSettings?.add ?? DEFAULT.siteSettings.add,
        edit: permissions.siteSettings?.edit ?? DEFAULT.siteSettings.edit,
        delete: permissions.siteSettings?.delete ?? DEFAULT.siteSettings.delete,
      },
      profile: {
        view: permissions.profile?.view ?? DEFAULT.profile.view,
        add: permissions.profile?.add ?? DEFAULT.profile.add,
        edit: permissions.profile?.edit ?? DEFAULT.profile.edit,
        delete: permissions.profile?.delete ?? DEFAULT.profile.delete,
      },
    };

    await user.save();

    await createAuditLog({
      action: "PERMISSIONS_UPDATED",
      performedBy: adminId,
      targetUser: user._id,
      previousValue: previous,
      newValue: user.permissions,
      description: `Permissions updated for ${user.firstname} ${user.lastname}`,
      req,
    });

    res.status(200).json({
      success: true,
      message: "Permissions updated successfully",
      permissions: user.permissions,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};


module.exports = {
  registerUser,
  loginUser,
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  changeAccountStatus,
  adminResetPassword,
  bulkUpdateUsers,
  getProfile,
  updateProfile,
  changePassword,
  forgotPassword,
  resetPassword,
  getActiveUsersForAssignment,
  deleteUser,
  updateUserPermissions,
};
