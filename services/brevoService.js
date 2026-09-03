const { BrevoClient } = require("@getbrevo/brevo");

let brevoClient = null;

function getBrevoClient() {
  if (!process.env.BREVO_API_KEY) {
    throw new Error("BREVO_API_KEY is missing in .env");
  }

  if (!brevoClient) {
    brevoClient = new BrevoClient({
      apiKey: process.env.BREVO_API_KEY,
    });

    console.log("✅ Brevo SDK initialized");
  }

  return brevoClient;
}

exports.sendBrevoEmail = async ({
  to,
  subject,
  html,
  text = "",
}) => {
  try {
    if (!to) {
      return {
        success: false,
        error: "Recipient email is missing",
      };
    }

    console.log("📤 Brevo Email Sending...");
    console.log("   → To:", to);
    console.log("   → Subject:", subject);

    const client = getBrevoClient();

    const response =
      await client.transactionalEmails.sendTransacEmail({
        sender: {
          name: process.env.BREVO_SENDER_NAME || "Task Portal",
          email: process.env.BREVO_SENDER_EMAIL,
        },

        to: [
          {
            email: to,
          },
        ],

        subject,

        htmlContent: html,

        ...(text
          ? {
              textContent: text,
            }
          : {}),
      });

    const messageId =
      response?.messageId ||
      response?.messageID ||
      response?.data?.messageId ||
      null;

    console.log("✅ Email accepted by Brevo");
    console.log("🆔 Brevo Message ID:", messageId);

    return {
      success: true,
      messageId,
      response,
    };
  } catch (error) {
    console.error("❌ Brevo Email Error:", error?.message || error);

    if (error?.response) {
      console.error(
        "Brevo Response:",
        JSON.stringify(error.response, null, 2)
      );
    }

    return {
      success: false,
      error: error?.message || "Brevo email sending failed",
    };
  }
};