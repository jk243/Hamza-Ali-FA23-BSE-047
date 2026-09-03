const fs = require("fs");
const path = require("path");
const multer = require("multer");
const bcrypt = require("bcryptjs");
const axios = require("axios");
const mongoose = require("mongoose");
const Settings = require("../models/SystemSettings");
const User = require("../models/User");
const { sendTestEmail } = require("../services/emailService");
const { sendWhatsAppReminder } = require("../services/whatsappService");
const { uploadToS3, deleteFromS3 } = require("../utils/s3");

const ALLOWED_SECTIONS = [
  "general",
  "reminders",
  "notifications",
  "email",
  "whatsapp",
  "security",
  "roles",
  "fileUpload",
  "appearance",
];

/* ========================= FOLDERS + MULTER ========================= */
const BACKUP_DIR = path.join(__dirname, "..", "storage", "backups");
const IMPORT_DIR = path.join(__dirname, "..", "storage", "imports");

[BACKUP_DIR, IMPORT_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Logo → memory storage (S3 ke liye). Local disk pe save nahi hota.
exports.uploadLogoMiddleware = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const ok = /\.(jpe?g|png|svg|webp)$/i.test(file.originalname);
    cb(ok ? null : new Error("Only image files allowed (jpg, png, svg, webp)."), ok);
  },
  limits: { fileSize: 5 * 1024 * 1024 },
}).single("logo");

const backupStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, BACKUP_DIR),
  filename: (req, file, cb) =>
    cb(null, `restore-${Date.now()}${path.extname(file.originalname).toLowerCase()}`),
});
exports.uploadBackupMiddleware = multer({
  storage: backupStorage,
  fileFilter: (req, file, cb) => {
    const ok = /\.(zip|gz|bson|json)$/i.test(file.originalname);
    cb(ok ? null : new Error("Only .zip, .gz, .bson or .json allowed."), ok);
  },
  limits: { fileSize: 200 * 1024 * 1024 },
}).single("backupFile");

const importStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, IMPORT_DIR),
  filename: (req, file, cb) =>
    cb(null, `import-${Date.now()}${path.extname(file.originalname).toLowerCase()}`),
});
exports.uploadImportMiddleware = multer({
  storage: importStorage,
  fileFilter: (req, file, cb) => {
    const ok = /\.(xlsx|csv|pdf)$/i.test(file.originalname);
    cb(ok ? null : new Error("Only .xlsx, .csv or .pdf allowed."), ok);
  },
  limits: { fileSize: 20 * 1024 * 1024 },
}).single("importFile");

/* ========================= CONTROLLERS ========================= */

// GET /api/settings
exports.getSettings = async (req, res) => {
  try {
    const settings = await Settings.getSingleton();
    return res.status(200).json({
      success: true,
      data: settings,
    });
  } catch (err) {
    console.error("getSettings error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to load settings.",
    });
  }
};

// PUT /api/settings/:section
// PUT /api/settings/:section
exports.updateSection = async (req, res) => {
  try {
    const { section } = req.params;

    if (!ALLOWED_SECTIONS.includes(section)) {
      return res.status(400).json({
        success: false,
        message: "Invalid settings section.",
      });
    }

    const settings = await Settings.getSingleton();

    const current = settings[section]
      ? settings[section].toObject
        ? settings[section].toObject()
        : { ...settings[section] }
      : {};

    // ---------- Reminders: on/off reliably save ----------
    if (section === "reminders") {
      const body = req.body || {};

      settings.reminders = {
        ...current,
        enabled:
          body.enabled !== undefined
            ? Boolean(body.enabled)
            : current.enabled !== false,
        emailEnabled:
          body.emailEnabled !== undefined
            ? Boolean(body.emailEnabled)
            : current.emailEnabled !== false,
        whatsappEnabled:
          body.whatsappEnabled !== undefined
            ? Boolean(body.whatsappEnabled)
            : Boolean(current.whatsappEnabled),
        beforeDueReminderEnabled:
          body.beforeDueReminderEnabled !== undefined
            ? Boolean(body.beforeDueReminderEnabled)
            : current.beforeDueReminderEnabled !== false,
        reminderBeforeDueValue:
          body.reminderBeforeDueValue !== undefined
            ? Number(body.reminderBeforeDueValue)
            : Number(current.reminderBeforeDueValue) || 1,
        reminderBeforeDueUnit:
          body.reminderBeforeDueUnit ||
          current.reminderBeforeDueUnit ||
          "Hours",
      };

      settings.markModified("reminders");
      await settings.save();

      return res.status(200).json({
        success: true,
        data: settings.reminders,
        message: "Settings saved successfully.",
      });
    }


    // ---------- WhatsApp: store Sandbox + Production separately ----------
if (section === "whatsapp") {
  const body = req.body || {};

  settings.whatsapp = {
    ...current,
    provider: body.provider || current.provider || "Vonage",
    useSandbox:
      body.useSandbox !== undefined
        ? Boolean(body.useSandbox)
        : current.useSandbox !== false,

    sandbox: {
      ...(current.sandbox || {}),
      ...(body.sandbox || {}),
    },
    production: {
      ...(current.production || {}),
      ...(body.production || {}),
    },
  };

  settings.markModified("whatsapp");
  await settings.save();

  return res.status(200).json({
    success: true,
    data: settings.whatsapp,
    message: "Settings saved successfully.",
  });
}

    // ---------- Email: store both Resend + Brevo separately ----------
    if (section === "email") {
      const body = req.body || {};

      // Keep the currently selected service
      settings.email = {
        ...current,
        service: body.service || current.service || "Resend",
        testEmailAddress:
          body.testEmailAddress !== undefined
            ? body.testEmailAddress
            : current.testEmailAddress || "",

        resend: {
          ...(current.resend || {}),
          ...(body.resend || {}),
        },
        brevo: {
          ...(current.brevo || {}),
          ...(body.brevo || {}),
        },
      };

      // Also keep backward-compatible flat fields (optional)
      const active = (body.service || current.service || "Resend").toLowerCase();
      if (active === "resend" && body.resend) {
        settings.email.senderName = body.resend.senderName || "";
        settings.email.senderEmail = body.resend.senderEmail || "";
        settings.email.apiKeyOrSmtp = body.resend.apiKeyOrSmtp || "";
      } else if (active === "brevo" && body.brevo) {
        settings.email.senderName = body.brevo.senderName || "";
        settings.email.senderEmail = body.brevo.senderEmail || "";
        settings.email.apiKeyOrSmtp = body.brevo.apiKeyOrSmtp || "";
      }

      settings.markModified("email");
      await settings.save();

      return res.status(200).json({
        success: true,
        data: settings.email,
        message: "Settings saved successfully.",
      });
    }

    // ---------- Baaki sections ----------
    settings[section] = { ...current, ...req.body };
    settings.markModified(section);
    await settings.save();

    return res.status(200).json({
      success: true,
      data: settings[section],
      message: "Settings saved successfully.",
    });
  } catch (err) {
    console.error("updateSection error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to save settings.",
    });
  }
};

// POST /api/settings/general/logo  →  S3 upload
exports.uploadLogo = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No logo file uploaded.",
      });
    }

    // S3 pe upload (folder: logos)
    const logoUrl = await uploadToS3(req.file, "logos");

    const settings = await Settings.getSingleton();

    // Purana logo delete
    const oldLogo = settings.general?.companyLogo;
    if (oldLogo) {
      if (oldLogo.includes(".amazonaws.com/") || oldLogo.startsWith("https://")) {
        try {
          await deleteFromS3(oldLogo);
        } catch (e) {
          console.warn("Old S3 logo delete failed:", e.message);
        }
      } else if (oldLogo.startsWith("/images/")) {
        // purane local path ko cleanup (migration ke liye)
        const LOGO_DIR = path.join(__dirname, "..", "public", "images", "user");
        const oldName = oldLogo.replace("/images/", "");
        const oldPath = path.join(LOGO_DIR, oldName);
        fs.unlink(oldPath, () => {});
      }
    }

    if (!settings.general) settings.general = {};
    settings.general.companyLogo = logoUrl; // full S3 URL
    settings.markModified("general");
    await settings.save();

    return res.status(200).json({
      success: true,
      logoUrl,
      message: "Company logo updated.",
    });
  } catch (err) {
    console.error("uploadLogo error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to upload logo.",
    });
  }
};

// PUT /api/settings/change-password
exports.changePassword = async (req, res) => {
  try {
    const userId = req.headers["x-user-id"] || req.user?._id;
    const { currentPassword, newPassword } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated.",
      });
    }
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Current and new password are required.",
      });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: "New password must be at least 8 characters.",
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: "Current password is incorrect.",
      });
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();

    return res.status(200).json({
      success: true,
      message: "Password changed successfully.",
    });
  } catch (err) {
    console.error("changePassword error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to change password.",
    });
  }
};

// POST /api/settings/email/test
// POST /api/settings/email/test
exports.testEmail = async (req, res) => {
  try {
    const { to, service } = req.body;

    if (!to) {
      return res.status(400).json({
        success: false,
        message: "Recipient email is required.",
      });
    }

    const settings = await Settings.getSingleton();
    const emailCfg = settings.email || {};
    const selectedService = (service || emailCfg.service || "Resend").trim();

    // Active service ke stored credentials lo
    const creds =
      selectedService === "Brevo"
        ? emailCfg.brevo || {}
        : emailCfg.resend || {};

    const subject = "Test Email from Task Portal";
    const html = `
      <h2>✅ Test Email Successful</h2>
      <p>Your email configuration is working correctly.</p>
      <p><b>Provider:</b> ${selectedService}</p>
      <p><b>Sender:</b> ${creds.senderName || "Task Portal"} &lt;${creds.senderEmail || ""}&gt;</p>
    `;
    const text = `Test Email Successful. Provider: ${selectedService}`;

    let result;

    if (selectedService === "Resend") {
      const { sendTestEmail } = require("../services/emailService");
      result = await sendTestEmail(to);
    } else {
      const { sendBrevoEmail } = require("../services/brevoService");
      result = await sendBrevoEmail({
        to,
        subject,
        html,
        text,
      });
    }

    if (!result || !result.success) {
      return res.status(500).json({
        success: false,
        message: (result && result.error) || "Failed to send test email.",
      });
    }

    return res.status(200).json({
      success: true,
      message: `Test email sent successfully via ${selectedService}`,
      messageId: result.messageId || null,
    });
  } catch (err) {
    console.error("testEmail error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to send test email.",
    });
  }
};
// POST /api/settings/whatsapp/test
// POST /api/settings/whatsapp/test
exports.testWhatsapp = async (req, res) => {
  try {
    const { to, useSandbox } = req.body;

    if (!to) {
      return res.status(400).json({
        success: false,
        message: "Recipient number is required.",
      });
    }

    const settings = await Settings.getSingleton();
    const wa = settings.whatsapp || {};

    const isSandbox =
      useSandbox !== undefined
        ? Boolean(useSandbox)
        : wa.useSandbox === true;

    // Pick the correct object
    const creds = isSandbox
      ? wa.sandbox || {}
      : wa.production || {};

    const finalApiKey = creds.apiKey || process.env.VONAGE_API_KEY;
    const finalApiSecret = creds.apiSecret || process.env.VONAGE_API_SECRET;
    const finalAppId = creds.applicationId || process.env.VONAGE_APPLICATION_ID;
    const finalPrivateKey = creds.privateKey || process.env.VONAGE_PRIVATE_KEY;
    const from =
      creds.defaultNumber ||
      process.env.VONAGE_WHATSAPP_FROM ||
      process.env.VONAGE_WHATSAPP_NUMBER;

    const hasKeyAuth = finalApiKey && finalApiSecret;
    const hasAppAuth = finalAppId && finalPrivateKey;

    if ((!hasKeyAuth && !hasAppAuth) || !from) {
      return res.status(400).json({
        success: false,
        message:
          "Vonage API Key + Secret (or Application ID + Private Key) and Default Number are required. Save them in WhatsApp settings first.",
      });
    }

    const result = await sendWhatsAppReminder(
      to,
      "This is a test WhatsApp message from System Settings.",
      {
        apiKey: finalApiKey,
        apiSecret: finalApiSecret,
        applicationId: finalAppId,
        privateKey: finalPrivateKey,
        defaultNumber: from,
        useSandbox: isSandbox,
      }
    );

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: result.error || "Failed to send test WhatsApp message.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Test WhatsApp message sent successfully.",
      sid: result.sid || result.messageUUID,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message:
        err.response?.data?.message ||
        err.message ||
        "Failed to send test WhatsApp message.",
    });
  }
};
// POST /api/settings/backup
exports.backupNow = async (req, res) => {
  try {
    const collections = await mongoose.connection.db.collections();
    const dump = {};
    for (const col of collections) {
      dump[col.collectionName] = await col.find({}).toArray();
    }

    const fileName = `backup-${Date.now()}.json`;
    fs.writeFileSync(
      path.join(BACKUP_DIR, fileName),
      JSON.stringify(dump, null, 2)
    );

    return res.status(200).json({
      success: true,
      message: `Backup created successfully (${fileName}).`,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message || "Backup failed.",
    });
  }
};

// POST /api/settings/restore
exports.restoreBackup = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No backup file uploaded.",
      });
    }

    if (path.extname(req.file.originalname).toLowerCase() !== ".json") {
      return res.status(400).json({
        success: false,
        message: "Only JSON backups are supported.",
      });
    }

    const raw = fs.readFileSync(req.file.path, "utf-8");
    const dump = JSON.parse(raw);

    for (const [name, docs] of Object.entries(dump)) {
      const col = mongoose.connection.db.collection(name);
      await col.deleteMany({});
      if (docs.length) await col.insertMany(docs);
    }

    fs.unlink(req.file.path, () => {});

    return res.status(200).json({
      success: true,
      message: "Backup restored successfully.",
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message || "Restore failed.",
    });
  }
};

// GET /api/settings/export
exports.exportData = async (req, res) => {
  try {
    const format = (req.query.format || "excel").toLowerCase();
    const settings = await Settings.getSingleton();
    const users = await User.find().select("-password").lean();

    const rows = users.map((u) => ({
      name: `${u.firstname || ""} ${u.lastname || ""}`.trim() || u.name || "",
      email: u.email,
      role: u.role,
    }));

    if (format === "csv") {
      const { stringify } = require("csv-stringify/sync");
      const csv = stringify(rows, { header: true });
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=export.csv");
      return res.status(200).send(csv);
    }

    if (format === "pdf") {
      const PDFDocument = require("pdfkit");
      const doc = new PDFDocument();
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", "attachment; filename=export.pdf");
      doc.pipe(res);
      doc
        .fontSize(16)
        .text(settings.general?.companyName || "System Export", {
          align: "center",
        });
      doc.moveDown();
      rows.forEach((r) => {
        doc
          .fontSize(11)
          .text(`${r.name || "-"}  |  ${r.email || "-"}  |  ${r.role || "-"}`);
      });
      doc.end();
      return;
    }

    // Excel
    const ExcelJS = require("exceljs");
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Users");
    sheet.columns = [
      { header: "Name", key: "name", width: 25 },
      { header: "Email", key: "email", width: 30 },
      { header: "Role", key: "role", width: 15 },
    ];
    sheet.addRows(rows);

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", "attachment; filename=export.xlsx");
    await workbook.xlsx.write(res);
    return res.end();
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message || "Export failed.",
    });
  }
};

// POST /api/settings/import
exports.importData = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No import file uploaded.",
      });
    }

    const ext = path.extname(req.file.originalname).toLowerCase();
    let rows = [];

    if (ext === ".csv") {
      const { parse } = require("csv-parse/sync");
      const raw = fs.readFileSync(req.file.path, "utf-8");
      rows = parse(raw, { columns: true, skip_empty_lines: true });
    } else if (ext === ".xlsx") {
      const ExcelJS = require("exceljs");
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(req.file.path);
      const sheet = workbook.worksheets[0];
      const headers = sheet.getRow(1).values.slice(1);
      sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const values = row.values.slice(1);
        const obj = {};
        headers.forEach((h, i) => (obj[h] = values[i]));
        rows.push(obj);
      });
    } else {
      return res.status(400).json({
        success: false,
        message: "Only CSV or XLSX supported for import.",
      });
    }

    fs.unlink(req.file.path, () => {});

    return res.status(200).json({
      success: true,
      message: `Data imported successfully (${rows.length} rows parsed).`,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message || "Import failed.",
    });
  }
};