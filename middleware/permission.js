// middleware/requirePermission.js
const User = require("../models/User");

const requirePermission = (module, action) => {
  return async (req, res, next) => {
    try {
      const userId = req.headers["x-user-id"];
      if (!userId) {
        return res.status(401).json({ success: false, message: "Not authenticated" });
      }

      const user = await User.findById(userId).select("role permissions");
      if (!user) {
        return res.status(401).json({ success: false, message: "User not found" });
      }

      // Founder = full access
      if (user.role === "Founder") {
        return next();
      }

      // Only HR uses granular permissions
      if (user.role !== "HR") {
        return res.status(403).json({ success: false, message: "Permission denied" });
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

module.exports = requirePermission;