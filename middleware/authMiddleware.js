const User = require("../models/User");

/**
 * Simple protect middleware using x-user-id header
 * Matches the existing auth pattern in UserControllers
 */
const protect = async (req, res, next) => {
  try {
    const userId = req.headers["x-user-id"];

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated: missing user id",
      });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated: user not found",
      });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Not authenticated: invalid user id",
    });
  }
};

module.exports = { protect };

