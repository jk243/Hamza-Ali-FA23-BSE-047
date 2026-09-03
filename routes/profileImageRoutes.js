const express = require("express");
const multer = require("multer");
const {
  uploadProfileImage,
  getProfileImage,
  deleteProfileImage,
} = require("../controllers/profileImageController");

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only images allowed"), false);
  },
});

// PUT /api/profile-image  (multipart file OR JSON base64)
router.put("/", upload.single("image"), uploadProfileImage);

router.get("/", getProfileImage);
router.delete("/", deleteProfileImage);

module.exports = router;