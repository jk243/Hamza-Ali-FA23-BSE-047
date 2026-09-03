const Reminder = require("../models/Remainder");
const Task = require("../models/Task");
const Settings = require("../models/SystemSettings");
const renderTemplate = require("../utils/renderTemplate");
const { sendReminderEmail } = require("./emailService"); // Resend
const { sendBrevoEmail } = require("./brevoService"); // Brevo
const { sendWhatsAppReminder } = require("./whatsappService");

/**
 * Format a Date using site settings (timezone + dateFormat + timeFormat)
 */
function formatDateTime(date, generalCfg) {
  if (!date) return "N/A";
  try {
    const d = new Date(date);
    const tz = generalCfg.timeZone || "Asia/Karachi";
    const dateFmt = generalCfg.dateFormat || "DD/MM/YYYY";
    const timeFmt = generalCfg.timeFormat || "12-hour (AM/PM)";

    const opts = {
      timeZone: tz,
      year: "numeric",
      month: dateFmt.includes("MMM") ? "short" : "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: timeFmt.includes("12"),
    };

    const parts = new Intl.DateTimeFormat("en-GB", opts).formatToParts(d);
    const get = (type) => parts.find((p) => p.type === type)?.value || "";

    let dateStr;
    if (dateFmt === "MM/DD/YYYY") {
      dateStr = `${get("month")}/${get("day")}/${get("year")}`;
    } else if (dateFmt === "YYYY-MM-DD") {
      dateStr = `${get("year")}-${get("month")}-${get("day")}`;
    } else if (dateFmt === "DD MMM YYYY") {
      dateStr = `${get("day")} ${get("month")} ${get("year")}`;
    } else {
      dateStr = `${get("day")}/${get("month")}/${get("year")}`;
    }

    const timeStr = `${get("hour")}:${get("minute")}${
      get("dayPeriod") ? " " + get("dayPeriod") : ""
    }`;

    return `${dateStr} ${timeStr}`.trim();
  } catch (e) {
    return new Date(date).toISOString().split("T")[0];
  }
}

/**
 * Calculate the next reminder date based on frequency
 */
function getNextReminderDate(reminder) {
  const currentDate = new Date(reminder.reminderDate);

  switch (reminder.frequency) {
    case "Daily":
      return new Date(currentDate.getTime() + 24 * 60 * 60 * 1000);
    case "Weekly":
      return new Date(currentDate.getTime() + 7 * 24 * 60 * 60 * 1000);
    case "Monthly": {
      const nextMonth = new Date(currentDate);
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      return nextMonth;
    }
    case "Custom": {
      if (reminder.customInterval && reminder.customIntervalUnit) {
        const multipliers = {
          minutes: 60 * 1000,
          hours: 60 * 60 * 1000,
          days: 24 * 60 * 60 * 1000,
        };
        const unit = String(reminder.customIntervalUnit).toLowerCase();
        const multiplier = multipliers[unit] || 24 * 60 * 60 * 1000;
        return new Date(
          currentDate.getTime() + reminder.customInterval * multiplier
        );
      }
      return null;
    }
    case "Once":
    default:
      return null;
  }
}

/**
 * Calculate before-due time = exact dueDate - (value + unit from System Settings)
 */
function calculateBeforeDueDate(dueDate, remCfg) {
  const due = new Date(dueDate);
  if (isNaN(due.getTime())) return null;

  const value = Number(remCfg.reminderBeforeDueValue) || 1;
  const unit = String(remCfg.reminderBeforeDueUnit || "Hours").toLowerCase();

  const result = new Date(due);

  if (unit === "minutes") {
    result.setMinutes(result.getMinutes() - value);
  } else if (unit === "hours") {
    result.setHours(result.getHours() - value);
  } else if (unit === "days") {
    result.setDate(result.getDate() - value);
  } else {
    result.setHours(result.getHours() - value);
  }

  return result;
}

/**
 * True if this task already has a USER-created reminder
 * (not system auto before-due / on-due).
 */
async function taskHasUserCreatedReminder(taskId) {
  const userReminder = await Reminder.findOne({
    taskId,
    $or: [
      { autoType: { $exists: false } },
      { autoType: null },
      { autoType: "" },
      { autoType: { $nin: ["before-due", "on-due"] } },
    ],
  }).select("_id");

  return !!userReminder;
}

/**
 * Create exactly TWO reminders for ONE user-selected task:
 * 1. BEFORE-DUE (only if remCfg.beforeDueReminderEnabled !== false)
 * 2. ON-DUE (always, independent of the before-due setting)
 *
 * IMPORTANT:
 * This function must ONLY be called for one specific task — never loop
 * it over "all open tasks". It should be triggered after the user
 * creates a reminder for that task.
 */
async function ensureAutoRemindersForTask(task, remCfg, options = {}) {
  if (!task || !task.dueDate) {
    console.log("⏭️ No task or dueDate");
    return null;
  }

  const due = new Date(task.dueDate);

  if (isNaN(due.getTime())) {
    console.log(`❌ Invalid dueDate | Task: ${task._id}`);
    return null;
  }

  const notificationType = options.notificationType || "Both";

  console.log(
    `🔔 Creating BEFORE-DUE + ON-DUE reminders for task: ${task._id}`
  );

  // ============================
  // 1. BEFORE-DUE
  //    Gated ONLY by beforeDueReminderEnabled. Does not affect on-due below.
  // ============================

  let beforeDueDate = null;

  if (remCfg.beforeDueReminderEnabled !== false) {
    beforeDueDate = calculateBeforeDueDate(task.dueDate, remCfg);
  }

  if (beforeDueDate) {
    let beforeReminder = await Reminder.findOne({
      taskId: task._id,
      autoType: "before-due",
      status: { $in: ["Pending", "Sent"] },
    });

    if (!beforeReminder) {
      beforeReminder = await Reminder.create({
        taskId: task._id,
        reminderDate: beforeDueDate,
        message:
          options.message || "Reminder: Task is approaching its due time.",
        frequency: "Once",
        notificationType,
        status: "Pending",
        autoType: "before-due",
      });

      console.log(
        `✅ BEFORE-DUE reminder created | Task: ${task._id} | ${beforeDueDate.toISOString()}`
      );
    } else {
      console.log(
        `⏭️ BEFORE-DUE already exists, skipping duplicate | Task: ${task._id}`
      );
    }
  } else {
    console.log(
      `⚠️ BEFORE-DUE not created | Task: ${task._id} | beforeDueReminderEnabled=${remCfg.beforeDueReminderEnabled}`
    );
  }

  // ============================
  // 2. ON-DUE
  //    ALWAYS created regardless of the before-due setting above.
  // ============================

  let onDueReminder = await Reminder.findOne({
    taskId: task._id,
    autoType: "on-due",
    status: { $in: ["Pending", "Sent"] },
  });

  if (!onDueReminder) {
    onDueReminder = await Reminder.create({
      taskId: task._id,
      reminderDate: due,
      message: options.onDueMessage || "Reminder: Task is due now.",
      frequency: "Once",
      notificationType,
      status: "Pending",
      autoType: "on-due",
    });

    console.log(
      `✅ ON-DUE reminder created | Task: ${task._id} | ${due.toISOString()}`
    );
  } else {
    console.log(
      `⏭️ ON-DUE already exists, skipping duplicate | Task: ${task._id}`
    );
  }

  return {
    beforeDueDate,
    onDueReminder,
  };
}

/**
 * Send email via selected provider
 */
/**
 * Send reminder email using the provider selected
 * in System Settings.
 *
 * Supported:
 *   Resend
 *   Brevo
 *   Both
 */
async function sendViaSelectedProvider({
  service,
  resendDefaultEmail,
  realRecipientEmail,
  subject,
  text,
  html,
  label,
  reminderId,
}) {
  const selectedService = String(service || "Resend")
    .trim()
    .toLowerCase();

  console.log("========================================");
  console.log("📧 REMINDER EMAIL");
  console.log("Provider:", selectedService);
  console.log("Label:", label);
  console.log("Real recipient:", realRecipientEmail);
  console.log("Resend recipient:", resendDefaultEmail);
  console.log("========================================");

  // =====================================================
  // RESEND ONLY
  // =====================================================
  if (selectedService === "resend") {
    if (!resendDefaultEmail) {
      return {
        success: false,
        provider: "Resend",
        error: "Resend recipient email is missing",
      };
    }

    console.log(
      `📤 RESEND ONLY → ${resendDefaultEmail}`
    );

    const result = await sendReminderEmail(
      resendDefaultEmail,
      subject,
      text,
      html
    );

    return {
      ...result,
      provider: "Resend",
    };
  }

  // =====================================================
  // BREVO ONLY
  // IMPORTANT:
  // NEVER use resendDefaultEmail here
  // =====================================================
  if (selectedService === "brevo") {
    if (!realRecipientEmail) {
      return {
        success: false,
        provider: "Brevo",
        error: "Brevo recipient email is missing",
      };
    }

    console.log(
      `📤 BREVO ONLY → ${realRecipientEmail}`
    );

    const result = await sendBrevoEmail({
      to: realRecipientEmail,
      subject,
      html,
      text,
    });

    return {
      ...result,
      provider: "Brevo",
    };
  }

  // =====================================================
  // BOTH
  // =====================================================
  if (selectedService === "both") {
    console.log(
      `📤 BOTH → Resend: ${resendDefaultEmail}`
    );

    console.log(
      `📤 BOTH → Brevo: ${realRecipientEmail}`
    );

    const resendPromise = resendDefaultEmail
      ? sendReminderEmail(
          resendDefaultEmail,
          subject,
          text,
          html
        )
      : Promise.resolve({
          success: false,
          error: "Resend recipient email is missing",
        });

    const brevoPromise = realRecipientEmail
      ? sendBrevoEmail({
          to: realRecipientEmail,
          subject,
          html,
          text,
        })
      : Promise.resolve({
          success: false,
          error: "Brevo recipient email is missing",
        });

    const [resendResult, brevoResult] =
      await Promise.all([resendPromise, brevoPromise]);

    console.log(
      "📨 BOTH RESULT:",
      {
        resend: resendResult,
        brevo: brevoResult,
      }
    );

    return {
      success:
        resendResult.success ||
        brevoResult.success,

      provider: "Both",

      resend: resendResult,
      brevo: brevoResult,

      messageId: {
        resend: resendResult.messageId || null,
        brevo: brevoResult.messageId || null,
      },
    };
  }

  // =====================================================
  // INVALID PROVIDER
  // =====================================================
  return {
    success: false,
    provider: selectedService,
    error:
      `Invalid email provider "${service}". ` +
      `Use Resend, Brevo, or Both.`,
  };
}
/**
 * Resolve channels
 */
function resolveChannels(reminder, remindersCfg, notifCfg) {
  const type = (reminder.notificationType || "Both").trim();

  const remEmailOn = remindersCfg.emailEnabled !== false;
  const remWaOn = remindersCfg.whatsappEnabled === true;

  const globalEmailOn = notifCfg.emailEnabled !== false;
  const globalWaOn = notifCfg.whatsappEnabled === true;

  let wantEmail = type === "Email" || type === "Both";
  let wantWhatsApp = type === "WhatsApp" || type === "Both";

  if (!remEmailOn || !globalEmailOn) wantEmail = false;
  if (!remWaOn || !globalWaOn) wantWhatsApp = false;

  return { wantEmail, wantWhatsApp };
}

exports.processReminders = async () => {
  const now = new Date();
  const settings = await Settings.getSingleton();

const emailCfg = settings.email || {};
const generalCfg = settings.general || {};
const notifCfg = settings.notifications || {};
const waCfg = settings.whatsapp || {};
const remindersCfg = settings.reminders || {};

if (remindersCfg.enabled === false) {
  console.log(
    "⏭️ Reminders MASTER OFF (System Settings → Reminders). Skipping all."
  );
  return;
}

// Get email provider selected from Site Settings
const service = String(
  emailCfg.service || "Resend"
).trim();

// Existing Resend recipient logic
const resendDefaultEmail =
  emailCfg.testEmailAddress ||
  emailCfg.senderEmail ||
  generalCfg.companyEmail ||
  null;

// Show provider being used by Reminder Service
console.log(
  "📡 REMINDER EMAIL PROVIDER FROM DATABASE:",
  service
);

console.log(
  `🔔 Reminders → master: ON | email: ${
    remindersCfg.emailEnabled !== false
  } | whatsapp: ${remindersCfg.whatsappEnabled === true}`
);

console.log(
  `⏰ Before due: ${remindersCfg.beforeDueReminderEnabled} (${remindersCfg.reminderBeforeDueValue} ${remindersCfg.reminderBeforeDueUnit})`
);

console.log(
  `🌍 Time zone: ${generalCfg.timeZone || "Asia/Karachi"}`
);

  // Process existing pending reminders only. This function deliberately does
  // NOT scan all open tasks and does NOT call any "ensure for all tasks"
  // helper — reminders only exist here if a user reminder created them.
  const reminders = await Reminder.find({
    status: "Pending",
    reminderDate: { $lte: now },
  });

  console.log(`📋 Found ${reminders.length} pending reminder(s) to process`);

  for (const reminder of reminders) {
    try {
      const task = await Task.findById(reminder.taskId)
        .populate("assigneeId")
        .populate("assignedBy");

      if (!task) {
        console.warn(
          `⚠️ Reminder ${reminder._id}: Task not found, marking as Completed`
        );
        reminder.status = "Completed";
        await reminder.save();
        continue;
      }

      if (task.status === "Done" || task.status === "Completed") {
        console.log(
          `✅ Reminder ${reminder._id}: Task "${task.title}" is completed, stopping`
        );
        reminder.status = "Completed";
        await reminder.save();
        continue;
      }

      const employee = task.assigneeId;
      const founder = task.assignedBy;

      if (!employee || !founder) {
        console.warn(
          `⚠️ Reminder ${reminder._id}: Missing employee or founder data`
        );
        reminder.status = "Failed";
        await reminder.save();
        continue;
      }

      const dueFormatted = formatDateTime(task.dueDate, generalCfg);

      const employeeMessage =
        "\nTask: " +
        task.title +
        "\nDeadline: " +
        dueFormatted +
        "\n" +
        (reminder.message || "") +
        "\n";

      const founderMessage =
        '\nReminder: You assigned "' +
        task.title +
        '" to ' +
        (employee.fullName || employee.email) +
        "\nDeadline: " +
        dueFormatted +
        "\nCurrent Status: " +
        task.status +
        "\n";

      const { wantEmail, wantWhatsApp } = resolveChannels(
        reminder,
        remindersCfg,
        notifCfg
      );

      if (!wantEmail && !wantWhatsApp) {
        console.warn(
          `⚠️ Reminder ${reminder._id}: no channel available. Left Pending.`
        );
        continue;
      }

      let emailSuccess = true;
      let whatsappSuccess = true;

      // -------------------- EMAIL --------------------
      if (wantEmail) {
        console.log(
          `📧 Sending emails for reminder ${reminder._id} via ${service}...`
        );

        const empEmailData = {
          webviewText: "View this email in your browser",
          greeting: "Hello " + (employee.fullName || employee.email) + ",",
          introText:
            "This is a reminder about a task assigned to you by " +
            (founder.fullName || founder.email) +
            ".",
          taskTitle: task.title,
          dueDate: dueFormatted,
          taskStatus: task.status,
          reminderMessage: reminder.message || "No additional message",
          taskLink: process.env.FRONTEND_URL
            ? process.env.FRONTEND_URL + "/tasks/" + task._id
            : "#",
          senderName:
            emailCfg.senderName ||
            generalCfg.companyName ||
            "Task Reminder System",
          companyName: generalCfg.companyName || "",
        };

        const empEmailHtml = renderTemplate("remainder", empEmailData);

   const empResult = await sendViaSelectedProvider({
  service,
  resendDefaultEmail,
  realRecipientEmail: employee.email,
  subject: "Task Reminder",
  text: employeeMessage,
  html: empEmailHtml,
  label: "Employee-task email",
  reminderId: reminder._id,
});

if (!empResult.success) {
  emailSuccess = false;
}

        const founderEmailData = {
          webviewText: "View this email in your browser",
          greeting: "Hello " + (founder.fullName || founder.email) + ",",
          introText: "This is a follow-up reminder for a task you assigned.",
          taskTitle: task.title,
          dueDate: dueFormatted,
          taskStatus: task.status,
          reminderMessage:
            "You assigned this task to " +
            (employee.fullName || employee.email) +
            ". Current status: " +
            task.status,
          taskLink: process.env.FRONTEND_URL
            ? process.env.FRONTEND_URL + "/tasks/" + task._id
            : "#",
          senderName:
            emailCfg.senderName ||
            generalCfg.companyName ||
            "Task Reminder System",
          companyName: generalCfg.companyName || "",
        };

        const founderEmailHtml = renderTemplate("remainder", founderEmailData);

        const founderResult = await sendViaSelectedProvider({
  service,
  resendDefaultEmail,
  realRecipientEmail: founder.email,
  subject: "CEO Follow-up Reminder",
  text: founderMessage,
  html: founderEmailHtml,
  label: "Founder email",
  reminderId: reminder._id,
});

if (!founderResult.success) {
  emailSuccess = false;
}
      } else {
        console.log(`⏭️ Email skipped for reminder ${reminder._id}`);
      }

      // -------------------- WHATSAPP --------------------
    // -------------------- WHATSAPP --------------------
// -------------------- WHATSAPP --------------------
if (wantWhatsApp) {
  console.log(`📱 Sending WhatsApp for reminder ${reminder._id}...`);

  // Debug: user object mein phone kis field mein hai
  console.log("👤 Employee phone fields:", {
    phone: employee.phone,
    phoneNumber: employee.phoneNumber,
    mobile: employee.mobile,
    contact: employee.contact,
    contactNumber: employee.contactNumber,
  });
  console.log("👤 Founder phone fields:", {
    phone: founder.phone,
    phoneNumber: founder.phoneNumber,
    mobile: founder.mobile,
    contact: founder.contact,
    contactNumber: founder.contactNumber,
  });

  const empPhone =
    employee.phone ||
    employee.phoneNumber ||
    employee.mobile ||
    employee.contact ||
    employee.contactNumber ||
    null;

  const founderPhone =
    founder.phone ||
    founder.phoneNumber ||
    founder.mobile ||
    founder.contact ||
    founder.contactNumber ||
    null;

  const waCredentials = {
    applicationId: waCfg.applicationId,
    privateKey: waCfg.privateKey,
    apiKey: waCfg.apiKey || process.env.VONAGE_API_KEY,
    apiSecret: waCfg.apiSecret || process.env.VONAGE_API_SECRET,
    defaultNumber:
      waCfg.defaultNumber ||
      process.env.VONAGE_WHATSAPP_FROM ||
      process.env.VONAGE_WHATSAPP_NUMBER,
    useSandbox:
      waCfg.useSandbox === true ||
      process.env.VONAGE_USE_SANDBOX === "true",
  };

  // Employee (same message as email text)
  if (empPhone) {
    try {
      const r = await sendWhatsAppReminder(
        empPhone,
        employeeMessage,
        waCredentials
      );
      if (!r.success) {
        whatsappSuccess = false;
        console.error(
          `❌ Employee WhatsApp failed for reminder ${reminder._id}: ${r.error}`
        );
      } else {
        console.log(
          `✅ Employee WhatsApp sent for reminder ${reminder._id} → ${empPhone}`
        );
      }
    } catch (err) {
      whatsappSuccess = false;
      console.error(
        `❌ Employee WhatsApp failed for reminder ${reminder._id}: ${err.message}`
      );
    }
  } else {
    whatsappSuccess = false;
    console.warn(
      `⚠️ No phone number for employee, WhatsApp skipped for reminder ${reminder._id}`
    );
  }

  // Founder (same message as email text)
  if (founderPhone) {
    try {
      const r = await sendWhatsAppReminder(
        founderPhone,
        founderMessage,
        waCredentials
      );
      if (!r.success) {
        whatsappSuccess = false;
        console.error(
          `❌ Founder WhatsApp failed for reminder ${reminder._id}: ${r.error}`
        );
      } else {
        console.log(
          `✅ Founder WhatsApp sent for reminder ${reminder._id} → ${founderPhone}`
        );
      }
    } catch (err) {
      whatsappSuccess = false;
      console.error(
        `❌ Founder WhatsApp failed for reminder ${reminder._id}: ${err.message}`
      );
    }
  } else {
    whatsappSuccess = false;
    console.warn(
      `⚠️ No phone number for founder, WhatsApp skipped for reminder ${reminder._id}`
    );
  }
} else {
  console.log(`⏭️ WhatsApp skipped for reminder ${reminder._id}`);
}
      // Delivery log
      reminder.deliveryLog = reminder.deliveryLog || [];
      reminder.deliveryLog.push({
        sentAt: new Date(),
        channel: reminder.notificationType,
        status: emailSuccess && whatsappSuccess ? "Success" : "Failed",
        error:
          !emailSuccess || !whatsappSuccess
            ? `Email: ${emailSuccess ? "OK" : "FAIL"} | WhatsApp: ${
                whatsappSuccess ? "OK" : "FAIL"
              }`
            : null,
      });

      reminder.sentCount = (reminder.sentCount || 0) + 1;
      reminder.lastSent = new Date();

      if (reminder.frequency === "Once") {
        reminder.status = "Sent";
        console.log(`✅ Reminder ${reminder._id} marked as Sent (one-time)`);
      } else {
        const nextDate = getNextReminderDate(reminder);
        if (nextDate) {
          reminder.reminderDate = nextDate;
          reminder.status = "Pending";
          console.log(
            `🔄 Reminder ${reminder._id} rescheduled to ${nextDate}`
          );
        } else {
          reminder.status = "Sent";
          console.log(
            `✅ Reminder ${reminder._id} marked as Sent (recurring ended)`
          );
        }
      }

      await reminder.save();
    } catch (err) {
      console.error(
        `❌ Critical error processing reminder ${reminder._id}: ${err.message}`
      );
      try {
        reminder.status = "Failed";
        await reminder.save();
      } catch (e) {
        console.error(
          `❌ Could not save reminder ${reminder._id}: ${e.message}`
        );
      }
    }
  }
};

/**
 * Call this from task create / update controller if you want a before-due
 * reminder ensured for a single task outside the "user reminder" flow.
 * NOTE: this intentionally still gates on beforeDueReminderEnabled since its
 * whole purpose is the before-due reminder specifically.
 */
exports.createAutoBeforeDueReminder = async (task, options = {}) => {
  if (!task || !task.dueDate) return null;

  const settings = await Settings.getSingleton();
  const remCfg = settings.reminders || {};

  if (remCfg.beforeDueReminderEnabled === false) {
    console.log("⏭️ Auto before-due disabled in System Settings");
    return null;
  }

  await ensureAutoRemindersForTask(task, remCfg, options);

  return await Reminder.findOne({
    taskId: task._id,
    autoType: "before-due",
    status: "Pending",
  });
};

/**
 * Call this AFTER a user creates a manual reminder on a task, e.g.:
 *
 *   const reminder = await Reminder.create(...);
 *   await ensureAutoRemindersAfterUserReminder(task, { notificationType: "Email" });
 *
 * Ensures before-due + on-due exist for THAT task only.
 *
 * FIX: previously this returned early whenever beforeDueReminderEnabled was
 * false, which killed the on-due reminder too. The before-due setting must
 * only gate the before-due reminder — on-due always gets created here.
 * That per-branch gating already lives inside ensureAutoRemindersForTask,
 * so this wrapper no longer duplicates (and mis-applies) the check.
 */
exports.ensureAutoRemindersAfterUserReminder = async (task, options = {}) => {
  if (!task || !task.dueDate) {
    return null;
  }

  const settings = await Settings.getSingleton();
  const remCfg = settings.reminders || {};

  if (remCfg.enabled === false) {
    console.log(`⏭️ Reminders master OFF | Task: ${task._id}`);
    return null;
  }

  // Only this specific task gets the 2 reminders.
  const result = await ensureAutoRemindersForTask(task, remCfg, {
    ...options,
    notificationType: options.notificationType || "Both",
  });

  return result;
};