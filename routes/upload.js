const express = require("express");
const multer = require("multer");
const { uploadToS3, deleteFromS3 } = require("../utils/s3");

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only images allowed"), false);
    }
  },
});

// POST /api/upload/image
router.post("/image", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No image provided" });
    }

    const folder = req.body.folder || "uploads";
    const url = await uploadToS3(req.file, folder);

    res.json({
      success: true,
      url,
      message: "Image uploaded successfully",
    });
  } catch (err) {
    console.error("S3 upload error:", err);
    res.status(500).json({ message: "Upload failed", error: err.message });
  }
});

// DELETE /api/upload/image
router.delete("/image", async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ message: "URL is required" });
    }

    await deleteFromS3(url);
    res.json({ success: true, message: "Image deleted" });
  } catch (err) {
    console.error("S3 delete error:", err);
    res.status(500).json({ message: "Delete failed", error: err.message });
  }
});

module.exports = router;