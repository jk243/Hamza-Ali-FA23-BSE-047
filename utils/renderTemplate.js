const fs = require("fs");
const path = require("path");
const Handlebars = require("handlebars");
const mjml2html = require("mjml");

/**
 * Renders an MJML template with Handlebars data → HTML string.
 * Call: renderTemplate("remainder", { greeting: "Hello", ... })
 */
function renderTemplate(templateName, data = {}) {
  try {
    const possiblePaths = [
      path.join(__dirname, "..", "template", `${templateName}.mjml`),
      path.join(__dirname, "..", "templates", `${templateName}.mjml`),
      path.join(__dirname, "..", "templete", `${templateName}.mjml`),
      path.join(process.cwd(), "template", `${templateName}.mjml`),
      path.join(process.cwd(), "templates", `${templateName}.mjml`),
      path.join(process.cwd(), "backend", "template", `${templateName}.mjml`),
      path.join(process.cwd(), "src", "template", `${templateName}.mjml`),
      path.join(process.cwd(), "utils", "..", "template", `${templateName}.mjml`),
    ];

    let templatePath = null;
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        templatePath = p;
        break;
      }
    }

    if (!templatePath) {
      console.error("❌ Template not found. Tried:");
      possiblePaths.forEach((p) => console.error("   -", p));
      throw new Error(`Template file not found: ${templateName}.mjml`);
    }

    console.log("✅ Using template:", templatePath);

    const mjmlSource = fs.readFileSync(templatePath, "utf8");

    const compile = Handlebars.compile(mjmlSource);
    const renderedMJML = compile({
      webviewText: data.webviewText || "View this email in your browser",
      greeting: data.greeting || "Hello,",
      introText: data.introText || "",
      taskTitle: data.taskTitle || "N/A",
      dueDate: data.dueDate || "N/A",
      taskStatus: data.taskStatus || "N/A",
      reminderMessage: data.reminderMessage || "",
      taskLink: data.taskLink || "#",
      senderName: data.senderName || "Elexoft Technologie",
      companyName: data.companyName || "",
      ...data,
    });

    const result = mjml2html(renderedMJML, {
      validationLevel: "soft",
      minify: false,
    });

    if (result.errors && result.errors.length > 0) {
      console.warn("⚠️ MJML warnings:", JSON.stringify(result.errors, null, 2));
    }

    if (!result.html || result.html.length < 100) {
      throw new Error(
        "mjml2html returned empty or too-short HTML (length=" +
          (result.html ? result.html.length : 0) +
          ")"
      );
    }

    console.log("✅ HTML generated successfully | Length:", result.html.length);
    return result.html;
  } catch (err) {
    console.error("❌ renderTemplate FAILED:", err.message);
    console.error(err.stack);

    // ==================== FALLBACK (Dark Blue + Elexoft Technologie) ====================
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Task Reminder - Elexoft Technologie</title>
</head>
<body style="margin:0;padding:0;background:#e8edf5;font-family:'Inter',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#e8edf5;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

          <!-- Top Bar -->
          <tr>
            <td style="padding:14px 20px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font-size:12px;color:#64748b;">${escapeHtml(data.webviewText || "View this email in your browser")}</td>
                  <td align="right" style="font-size:12px;color:#64748b;">Task Reminder</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Company Brand Header -->
          <tr>
            <td style="background:#0f172a;padding:22px 25px;text-align:center;">
              <div style="font-size:22px;font-weight:700;color:#ffffff;letter-spacing:0.3px;">
                Elexoft Technologie
              </div>
              <div style="font-size:12px;color:#94a3b8;margin-top:4px;">
                Professional Task Management
              </div>
            </td>
          </tr>

          <!-- Hero -->
          <tr>
            <td style="background:#1e3a5f;padding:42px 30px;text-align:center;">
              <div style="font-size:26px;font-weight:700;color:#ffffff;margin-bottom:12px;">
                ${escapeHtml(data.greeting || "Hello,")}
              </div>
              <div style="font-size:15px;color:#cbd5e1;">
                ${escapeHtml(data.introText || "")}
              </div>
            </td>
          </tr>

          <!-- Task Details -->
          <tr>
            <td style="background:#ffffff;padding:36px 30px 20px;">
              <div style="font-size:18px;font-weight:600;color:#0f172a;text-align:center;margin-bottom:20px;">
                Task Details
              </div>
              <div style="font-size:15px;color:#334155;margin-bottom:10px;">
                <b>Task:</b> ${escapeHtml(data.taskTitle || "N/A")}
              </div>
              <div style="font-size:15px;color:#334155;margin-bottom:10px;">
                <b>Deadline:</b> ${escapeHtml(data.dueDate || "N/A")}
              </div>
              <div style="font-size:15px;color:#334155;margin-bottom:18px;">
                <b>Status:</b>
                <span style="background:#e0f2fe;color:#0369a1;padding:5px 14px;border-radius:20px;font-size:13px;font-weight:600;">
                  ${escapeHtml(data.taskStatus || "N/A")}
                </span>
              </div>
            </td>
          </tr>

          <!-- Reminder Message -->
          <tr>
            <td style="background:#ffffff;padding:0 30px 30px;">
              <div style="background:#f1f5f9;border-radius:8px;padding:16px 20px;font-size:14px;color:#475569;line-height:22px;">
                ${escapeHtml(data.reminderMessage || "")}
              </div>
            </td>
          </tr>

          <!-- Buttons -->
          <tr>
            <td style="background:#ffffff;padding:0 30px 40px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="48%" style="padding-right:8px;">
                    <a href="${escapeAttr(data.taskLink || "#")}"
                       style="display:block;background:#1e3a5f;color:#ffffff;text-decoration:none;text-align:center;padding:14px 10px;border-radius:8px;font-size:14px;font-weight:600;">
                      View Task
                    </a>
                  </td>
                  <td width="48%" style="padding-left:8px;">
                    <a href="${escapeAttr(data.taskLink || "#")}"
                       style="display:block;background:#0f172a;color:#ffffff;text-decoration:none;text-align:center;padding:14px 10px;border-radius:8px;font-size:14px;font-weight:600;">
                      Mark Complete
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Bottom Info Strip -->
          <tr>
            <td style="background:#1e3a5f;padding:28px 30px;text-align:center;">
              <div style="font-size:16px;font-weight:600;color:#ffffff;margin-bottom:10px;">
                Don't miss your deadline
              </div>
              <div style="font-size:13px;color:#94a3b8;">
                This is an automated reminder from Elexoft Technologie Task System.
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:26px 20px;text-align:center;">
              <div style="font-size:13px;color:#475569;margin-bottom:6px;">
                Sent by <b>Elexoft Technologie</b>
                ${data.companyName ? " · " + escapeHtml(data.companyName) : ""}
              </div>
              <div style="font-size:12px;color:#94a3b8;">
                You are receiving this email because you have an active task reminder.
              </div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(str) {
  return String(str || "#").replace(/"/g, "&quot;");
}

module.exports = renderTemplate;