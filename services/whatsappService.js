const { Vonage } = require("@vonage/server-sdk");
const { WhatsAppText } = require("@vonage/messages");
const Settings = require("../models/SystemSettings");

/**
 * Normalize phone to E.164-ish digits (no +)
 * PK: 0303... → 92303... | 303... → 92303...
 */
function normalizePhone(phone) {
  let cleaned = String(phone || "").replace(/\D/g, "");
  if (!cleaned) return "";

  // 00 prefix
  if (cleaned.startsWith("00")) {
    cleaned = cleaned.slice(2);
  }

  // Pakistan local formats
  if (cleaned.startsWith("0") && cleaned.length >= 10) {
    cleaned = "92" + cleaned.slice(1); // 0303... → 92303...
  } else if (cleaned.length === 10 && cleaned.startsWith("3")) {
    cleaned = "92" + cleaned; // 3035884872 → 923035884872
  }

  return cleaned;
}

exports.sendWhatsAppReminder = async (phone, message, credentials = null) => {
  try {
    let apiKey, apiSecret, applicationId, privateKey, fromNumber, useSandbox;

    if (credentials) {
      apiKey = credentials.apiKey;
      apiSecret = credentials.apiSecret;
      applicationId = credentials.applicationId;
      privateKey = credentials.privateKey;
      fromNumber = credentials.defaultNumber || credentials.from;
      useSandbox = credentials.useSandbox === true;
    } else {
      const settings = await Settings.getSingleton();
      const wa = settings.whatsapp || {};
      apiKey = wa.apiKey || process.env.VONAGE_API_KEY;
      apiSecret = wa.apiSecret || process.env.VONAGE_API_SECRET;
      applicationId = wa.applicationId || process.env.VONAGE_APPLICATION_ID;
      privateKey = wa.privateKey || process.env.VONAGE_PRIVATE_KEY;
      fromNumber =
        wa.defaultNumber ||
        process.env.VONAGE_WHATSAPP_FROM ||
        process.env.VONAGE_WHATSAPP_NUMBER;
      useSandbox =
        wa.useSandbox === true || process.env.VONAGE_USE_SANDBOX === "true";
    }

    if (!fromNumber) {
      return {
        success: false,
        error: "Vonage From number (defaultNumber) is missing",
      };
    }

    const hasKeyAuth = !!(apiKey && apiSecret);
    const hasAppAuth = !!(applicationId && privateKey);

    if (!hasKeyAuth && !hasAppAuth) {
      return {
        success: false,
        error: "Need API Key+Secret or Application ID+Private Key",
      };
    }

    const to = normalizePhone(phone);
    const from = normalizePhone(fromNumber);

    if (!to) {
      return { success: false, error: "Invalid recipient phone number" };
    }

    console.log("📤 Vonage send →", {
      to,
      from,
      useSandbox,
      hasKeyAuth,
      hasAppAuth,
    });

    const auth = {};
    if (hasAppAuth) {
      auth.applicationId = applicationId;
      auth.privateKey = privateKey;
    }
    if (hasKeyAuth) {
      auth.apiKey = apiKey;
      auth.apiSecret = apiSecret;
    }

    const options = {};
    if (useSandbox) {
      options.apiHost = "https://messages-sandbox.nexmo.com";
    }

    const vonage = new Vonage(auth, options);

    const response = await vonage.messages.send(
      new WhatsAppText({
        to,
        from,
        text: message,
      })
    );

    const uuid = response.messageUUID || response.messageUuid;
    console.log("✅ WhatsApp Sent (Vonage):", uuid);
    return { success: true, sid: uuid, messageUUID: uuid };
  } catch (error) {
    console.error("❌ WhatsApp Error (Vonage):", error.message);

    if (error.response) {
      console.error("Status:", error.response.status);
      // Prefer readable body if available
      const body =
        error.response.data ||
        error.response.body ||
        error.response.statusText ||
        {};
      console.error("Body:", typeof body === "string" ? body : JSON.stringify(body, null, 2));
    }

    return { success: false, error: error.message };
  }
};