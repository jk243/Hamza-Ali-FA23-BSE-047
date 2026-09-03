const { Resend } = require("resend");

// ---------------------------------------------------------------------------
// 1. Validate environment at startup
// ---------------------------------------------------------------------------
if (!process.env.RESEND_API_KEY) {
    console.error("❌ CRITICAL: RESEND_API_KEY is not set in environment variables.");
    console.error("   → Set it in your .env file: RESEND_API_KEY=re_xxxxxxxxxxxx");
    process.exit(1); // hard-fail so developer knows immediately
}

const resend = new Resend(process.env.RESEND_API_KEY);

// Used only for logging / diagnostics
const configuredSender = process.env.EMAIL_FROM || "Reminder System <onboarding@resend.dev>";
const verifiedDomain = process.env.VERIFIED_DOMAIN || null; // e.g. "yourdomain.com"

console.log("✅ Resend SDK initialized");
console.log(`📧 Configured sender: ${configuredSender}`);
if (!verifiedDomain) {
    console.warn(
        "⚠️  No VERIFIED_DOMAIN set in .env. If you rely on onboarding@resend.dev, " +
        "emails will ONLY reach the address you registered with on Resend."
    );
}

// ---------------------------------------------------------------------------
// 2. Internal: send a single email (low-level helper)
// ---------------------------------------------------------------------------
async function sendSingleEmail({ to, subject, text, html }) {
    if (!to) {
        return { success: false, error: "Recipient email is missing" };
    }

    const payload = {
        from: configuredSender,
        to,
        subject,
    };

    // Prefer HTML when available, fall back to plain text
    if (html) {
        payload.html = html;
    } else if (text) {
        payload.text = text;
    } else {
        return { success: false, error: "Neither text nor html content provided" };
    }

    console.log(`📤 Sending email → ${to} | subject: "${subject}"`);

    // ---- Send via Resend SDK v6 ----
    let response;
    try {
        response = await resend.emails.send(payload);
    } catch (err) {
        // SDK threw a *network / runtime* error (e.g. DNS failure, timeout)
        console.error(`❌ Network/Runtime error sending to ${to}:`, {
            message: err.message,
            stack: err.stack?.split("\n").slice(0, 3).join("\n"),
        });
        return { success: false, error: `Network error: ${err.message}` };
    }

    // -----------------------------------------------------------------------
    // 3. Validate Resend v6 response shape: { data, error }
    //    - Success: { data: { id: "uuid" }, error: null }
    //    - Failure: { data: null,  error: { message: "...", name: "..." } }
    // -----------------------------------------------------------------------
    const { data, error } = response || {};

    // --- 3a. SDK returned an explicit error object ---
    if (error) {
        // The most common reason when using onboarding@resend.dev:
        // "You can only send to emails that belong to your account"
        const isSandboxRestriction =
            error.message?.toLowerCase().includes("onboarding@resend.dev") ||
            error.message?.toLowerCase().includes("sandbox") ||
            error.message?.toLowerCase().includes("only send to emails that belong to your account");

        if (isSandboxRestriction) {
            console.error(
                `🚫 SANDBOX RESTRICTION: onboarding@resend.dev can ONLY deliver to the ` +
                `email address you used to register on Resend. "${to}" will never receive it.`
            );
        }

        console.error(`❌ Resend API error for ${to}:`, {
            name: error.name || "ApiError",
            message: error.message,
        });

        return {
            success: false,
            error: error.message || "Unknown Resend API error",
            isSandboxRestriction,
        };
    }

    // --- 3b. data is null / missing ---
    if (!data) {
        console.error(`❌ Resend returned null/undefined data for ${to}. Full response:`, JSON.stringify(response));
        return {
            success: false,
            error: "Resend API returned null data (no error thrown). Possible API key issue or sandbox restriction.",
        };
    }

    // --- 3c. data.id is missing ---
    if (!data.id) {
        console.error(`❌ Resend response missing 'id' for ${to}. Full data:`, JSON.stringify(data));
        return {
            success: false,
            error: "Resend API response did not contain an email id — email may not have been accepted.",
        };
    }

    // --- 4. Everything looks good — email was accepted by Resend ---
    console.log(`✅ Email ACCEPTED by Resend → ${to} | messageId: ${data.id}`);
    return {
        success: true,
        messageId: data.id,
        // Resend v6 doesn't expose "queued / delivered / rejected" status
        // from the send() call. Those events show up in webhooks. But the
        // fact we got an id back means Resend accepted the send request.
        status: "accepted",
    };
}

// ---------------------------------------------------------------------------
// 4. High-level public API – used by remainderService
// ---------------------------------------------------------------------------

/**
 * Send a task-reminder email.
 *
 * @param {string}  to        Recipient email address
 * @param {string}  subject   Subject line
 * @param {string}  text      Plain-text body (or markdown)
 * @param {string}  [html]    Optional HTML body (takes precedence over text)
 *
 * @returns {Promise<{success: boolean, messageId?: string, status?: string, error?: string, isSandboxRestriction?: boolean}>}
 */
exports.sendReminderEmail = async (to, subject, text, html) => {
    console.group(`📧 sendReminderEmail → ${to}`);
    console.log(`   Subject : ${subject}`);
    console.log(`   Sender  : ${configuredSender}`);

    const result = await sendSingleEmail({ to, subject, text, html });

    // Final log line that shows up in your console
    if (result.success) {
        console.log(`   ✅ Final: Email accepted — id=${result.messageId}`);
    } else {
        console.log(`   ❌ Final: Email failed — ${result.error}`);
    }
    console.groupEnd();

    return result;
};

/**
 * Send a test email to yourself to verify Resend configuration.
 * Call this from a temporary route or REPL during setup.
 */
exports.sendTestEmail = async (to) => {
    console.log("🧪 Sending test email to", to);
    return sendSingleEmail({
        to,
        subject: "Test Email from Reminder System",
        text: "If you received this, your Resend configuration is working correctly.",
        html: "<h2>✅ Resend is working!</h2><p>Email delivery is properly configured.</p>",
    });
};

// Utility export – helpful for debugging response shapes
exports.rawSend = async (payload) => {
    return resend.emails.send(payload);
};