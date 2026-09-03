const cron = require("node-cron");
const { processReminders } = require("../services/remainderService");

let isProcessing = false;

// Run every minute to check for pending reminders
cron.schedule("* * * * *", async () => {
    if (isProcessing) {
        console.log("⏳ Cron Job: Previous run still in progress, skipping...");
        return;
    }

    isProcessing = true;
    console.log("⏰ Cron Job: Checking for pending reminders...");

    try {
        await processReminders();
        console.log("✅ Cron Job: Reminder processing completed");
    } catch (error) {
        console.error("❌ Cron Job Error:", error.message);
    } finally {
        isProcessing = false;
    }
});

console.log("✅ Remainder Cron Job Scheduled");
