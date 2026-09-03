const express = require("express");
const router = express.Router();
const {
  loginUser,
  registerUser,
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
} = require("../controllers/UserControllers");

const User = require("../models/User");

// ======================
// Permission Middleware
// ======================
const requirePermission = (module, action) => {
  return async (req, res, next) => {
    try {
      const userId = req.headers["x-user-id"];
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Not authenticated",
        });
      }

      const user = await User.findById(userId).select("role permissions");
      if (!user) {
        return res.status(401).json({
          success: false,
          message: "User not found",
        });
      }

      // Founder = full access
      if (user.role === "Founder") {
        return next();
      }

      // Only HR uses granular permissions
      if (user.role !== "HR") {
        return res.status(403).json({
          success: false,
          message: "Permission denied",
        });
      }

      const allowed = user.permissions?.[module]?.[action] === true;

      if (!allowed) {
        return res.status(403).json({
          success: false,
          message: `You do not have ${action} permission for ${module}`,
        });
      }

      next();
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  };
};

// ======================
// Public Routes
// ======================
router.post("/register", registerUser);
router.post("/login", loginUser);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);

// ======================
// Own Profile (sab roles)
// ======================
router.get("/profile", getProfile);
router.put("/profile", updateProfile);
router.put("/change-password", changePassword);

// ======================
// User Management (permission based)
// ======================
router.get(
  "/get",
  requirePermission("userManagement", "view"),
  getAllUsers
);

router.get("/active-for-assignment", getActiveUsersForAssignment);

router.get(
  "/:id",
  requirePermission("userManagement", "view"),
  getUserById
);

router.post(
  "/create",
  requirePermission("userManagement", "add"),
  createUser
);

router.put(
  "/:id",
  requirePermission("userManagement", "edit"),
  updateUser
);

router.patch(
  "/:id/status",
  requirePermission("userManagement", "edit"),
  changeAccountStatus
);

router.patch(
  "/:id/reset-password",
  requirePermission("userManagement", "edit"),
  adminResetPassword
);

router.post(
  "/bulk",
  requirePermission("userManagement", "edit"),
  bulkUpdateUsers
);

router.delete(
  "/:id",
  requirePermission("userManagement", "delete"),
  deleteUser
);

router.put(
  "/:id/permissions",
  requirePermission("userManagement", "edit"), // practically only Founder will use this
  updateUserPermissions
);

module.exports = router;