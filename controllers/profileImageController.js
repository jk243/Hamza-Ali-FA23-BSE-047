const mongoose = require("mongoose");
const ProfileImage = require("../models/ProfileImage");
const { uploadToS3, deleteFromS3 } = require("../utils/s3");

function getValidUserId(req) {
  const userId = req.headers["x-user-id"];
  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    return null;
  }
  return userId;
}

/**
 * PUT /api/profile-image
 * Accepts multipart file (image) → uploads to S3 → saves URL in DB
 * Also still accepts base64 in body.image for backward compatibility
 */
exports.uploadProfileImage = async (req, res) => {
  try {
    const userId = getValidUserId(req);
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Missing or invalid x-user-id header.",
      });
    }

    let imageUrl = null;

    // Case 1: multipart file (S3)
    if (req.file) {
      imageUrl = await uploadToS3(req.file, "avatars");
    }
    // Case 2: base64 string in body (old way — still works)
    else if (req.body?.image && typeof req.body.image === "string") {
      imageUrl = req.body.image.trim();
    }

    if (!imageUrl) {
      return res.status(400).json({
        success: false,
        message: "Image is required (file or base64).",
      });
    }

    // Agar pehle S3 image thi to purani delete kar do
    const existing = await ProfileImage.findOne({ userId });
    if (existing?.image?.includes(".amazonaws.com/")) {
      try {
        await deleteFromS3(existing.image);
      } catch (e) {
        console.warn("Old S3 image delete failed:", e.message);
      }
    }

    const updated = await ProfileImage.findOneAndUpdate(
      { userId },
      { userId, image: imageUrl },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    return res.status(200).json({
      success: true,
      message: "Profile image saved successfully.",
      image: updated.image,
    });
  } catch (error) {
    console.error("uploadProfileImage error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while saving profile image.",
      error: error.message,
    });
  }
};

/**
 * GET /api/profile-image
 */
exports.getProfileImage = async (req, res) => {
  try {
    const userId = getValidUserId(req);
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Missing or invalid x-user-id header.",
      });
    }

    const doc = await ProfileImage.findOne({ userId });

    return res.status(200).json({
      success: true,
      image: doc ? doc.image : null,
    });
  } catch (error) {
    console.error("getProfileImage error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching profile image.",
    });
  }
};

/**
 * DELETE /api/profile-image
 */
exports.deleteProfileImage = async (req, res) => {
  try {
    const userId = getValidUserId(req);
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Missing or invalid x-user-id header.",
      });
    }

    const existing = await ProfileImage.findOne({ userId });
    if (!existing) {
      return res.status(200).json({
        success: true,
        message: "No profile image to delete.",
      });
    }

    // S3 se bhi delete
    if (existing.image?.includes(".amazonaws.com/")) {
      try {
        await deleteFromS3(existing.image);
      } catch (e) {
        console.warn("S3 delete failed:", e.message);
      }
    }

    await ProfileImage.findOneAndDelete({ userId });

    return res.status(200).json({
      success: true,
      message: "Profile image deleted successfully.",
    });
  } catch (error) {
    console.error("deleteProfileImage error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while deleting profile image.",
    });
  }
};