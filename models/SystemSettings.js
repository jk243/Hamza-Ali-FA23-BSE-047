const mongoose = require("mongoose");

const settingsSchema = new mongoose.Schema(
  {
    general: {
      systemName: { type: String, default: "" },
      companyName: { type: String, default: "" },
      companyLogo: { type: String, default: "" }, // e.g. "/images/user/logo-123.png"
      companyEmail: { type: String, default: "1213196@gmail.com" },
      companyPhone: { type: String, default: "" },
      companyAddress: { type: String, default: "" },
      timeZone: { type: String, default: "Asia/Karachi" },
      dateFormat: { type: String, default: "DD/MM/YYYY" },
      timeFormat: { type: String, default: "12-hour (AM/PM)" },
      language: { type: String, default: "English" },
    },
    reminders: {
    enabled: { type: Boolean, default: true },
    emailEnabled: { type: Boolean, default: true },
    whatsappEnabled: { type: Boolean, default: false },
   beforeDueReminderEnabled: { type: Boolean, default: true },
   reminderBeforeDueValue: { type: Number, default: 1 },
   reminderBeforeDueUnit: { type: String, default: "Hours" },
  },
    notifications: {
      emailEnabled: { type: Boolean, default: true },
      whatsappEnabled: { type: Boolean, default: false },
      smsEnabled: { type: Boolean, default: false },
      inAppEnabled: { type: Boolean, default: true },
      browserEnabled: { type: Boolean, default: true },
    },
    email: {
  service: { type: String, default: "Resend" },
  testEmailAddress: { type: String, default: "" },

  // Resend credentials
  resend: {
    senderName: { type: String, default: "" },
    senderEmail: { type: String, default: "1213196@gmail.com" },
    apiKeyOrSmtp: { type: String, default: "" },
  },

  // Brevo credentials
  brevo: {
    senderName: { type: String, default: "" },
    senderEmail: { type: String, default: "1213196@gmail.com" },
    apiKeyOrSmtp: { type: String, default: "" },
  },
},
    whatsapp: {
  provider: { type: String, default: "Vonage" },
  useSandbox: { type: Boolean, default: true },

  // Sandbox credentials
  sandbox: {
    apiKey: { type: String, default: "" },
    apiSecret: { type: String, default: "" },
    applicationId: { type: String, default: "" },
    privateKey: { type: String, default: "" },
    defaultNumber: { type: String, default: "" },
    testNumber: { type: String, default: "" },
  },

  // Production credentials
  production: {
    apiKey: { type: String, default: "" },
    apiSecret: { type: String, default: "" },
    applicationId: { type: String, default: "" },
    privateKey: { type: String, default: "" },
    defaultNumber: { type: String, default: "" },
    testNumber: { type: String, default: "" },
  },
},
    security: {
      passwordPolicy: {
        type: String,
        default: "Strong (8+ chars, upper, lower, number, special)",
      },
      sessionTimeout: { type: Number, default: 30 },
      twoFactorEnabled: { type: Boolean, default: false },
      loginAttemptLimit: { type: Number, default: 5 },
    },
    roles: {
      founder: {
        manageUsers: { type: Boolean, default: true },
        manageRoles: { type: Boolean, default: true },
        manageReminders: { type: Boolean, default: true },
        manageTasks: { type: Boolean, default: true },
        viewReports: { type: Boolean, default: true },
        manageSettings: { type: Boolean, default: true },
      },
      // Keyed by employee _id -> { manageUsers, manageRoles, ... }
      employees: { type: mongoose.Schema.Types.Mixed, default: {} },
    },
    fileUpload: {
      profilePictureUploadEnabled: { type: Boolean, default: true },
      maxFileSizeMB: { type: Number, default: 5 },
      allowedFileTypes: {
        type: [String],
        default: ["JPG", "JPEG", "PNG", "PDF"],
      },
    },
    appearance: {
      mode: { type: String, default: "Light" },
      themeColor: { type: String, default: "#465FFF" },
      sidebarCollapsedByDefault: { type: Boolean, default: false },
      brandingText: { type: String, default: "" },
    },
  },
  { timestamps: true, minimize: false }
);

// There is only ever ONE settings document for the whole system.
// getSingleton() creates it the first time it's needed and reuses it after.
settingsSchema.statics.getSingleton = async function () {
  let doc = await this.findOne();
  if (!doc) {
    doc = await this.create({});
  }
  return doc;
};

module.exports = mongoose.model("SystemSettings", settingsSchema);