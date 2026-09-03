const express = require("express");
const router = express.Router();

const {
  getSettings,
  updateSection,
  uploadLogo,
  changePassword,
  testEmail,
  testWhatsapp,
  backupNow,
  restoreBackup,
  exportData,
  importData,
  uploadLogoMiddleware,
  uploadBackupMiddleware,
  uploadImportMiddleware,
} = require("../controllers/SystemSettingsController");

// Specific routes MUST come before the generic "/:section" route below.
router.get("/", getSettings);
router.put("/change-password", changePassword);
router.post("/email/test", testEmail);
router.post("/whatsapp/test", testWhatsapp);
router.post("/backup", backupNow);
router.post("/restore", uploadBackupMiddleware, restoreBackup);
router.get("/export", exportData);
router.post("/import", uploadImportMiddleware, importData);
router.post("/general/logo", uploadLogoMiddleware, uploadLogo);

// Generic per-section save: PUT /api/settings/general, /api/settings/roles, etc.
router.put("/:section", updateSection);

module.exports = router;
