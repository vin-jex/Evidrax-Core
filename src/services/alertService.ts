import { Resend } from "resend";
import config from "../config";
import logger from "../utils/logger";

const resend = new Resend(config.resend.apiKey);

interface AlertPayload {
  type: string;
  evidenceId?: string | null;
  message: string;
  riskLevel: string;
  metadata?: Record<string, unknown>;
}

interface AnomalyResult {
  riskLevel: string;
  score: number;
  details?: Array<{ anomaly: boolean }>;
}

export async function sendAlert({
  type,
  evidenceId,
  message,
  riskLevel,
  metadata = {},
}: AlertPayload): Promise<void> {
  if (!config.resend.apiKey || config.resend.apiKey === "re_your_resend_key") {
    logger.warn("Resend not configured - skipping email alert", {
      type,
      riskLevel,
    });
    return;
  }

  const subject = `[${riskLevel.toUpperCase()}] Evidrax-Core Alert: ${type}`;
  const html = buildEmailTemplate({
    type,
    evidenceId,
    message,
    riskLevel,
    metadata,
  });

  try {
    await resend.emails.send({
      from: config.resend.from,
      to: config.resend.to,
      subject,
      html,
    });
    logger.info("Alert email sent", { type, riskLevel });
  } catch (err) {
    logger.error("Failed to send alert email", {
      error: (err as Error).message,
      type,
    });
  }
}

export async function sendTamperAlert(
  evidenceId: string,
  storedHash: string,
  currentHash: string,
): Promise<void> {
  return sendAlert({
    type: "HASH_MISMATCH",
    evidenceId,
    riskLevel: "critical",
    message: `Evidence integrity verification FAILED for evidence ID: ${evidenceId}`,
    metadata: { storedHash, currentHash },
  });
}

export async function sendAnomalyAlert(
  anomalyResult: AnomalyResult,
  evidenceId: string | null = null,
): Promise<void> {
  return sendAlert({
    type: "ANOMALY_DETECTED",
    evidenceId,
    riskLevel: anomalyResult.riskLevel,
    message: `AI anomaly detection flagged suspicious activity. Score: ${anomalyResult.score}`,
    metadata: {
      score: anomalyResult.score,
      details: anomalyResult.details?.slice(0, 3),
    },
  });
}

// ── Email Template ─────────────────────────────────────────────────────────────

const RISK_PALETTE: Record<
  string,
  { bg: string; badge: string; border: string; icon: string }
> = {
  low: { bg: "#f0fdf4", badge: "#16a34a", border: "#bbf7d0", icon: "🟢" },
  medium: { bg: "#fffbeb", badge: "#d97706", border: "#fde68a", icon: "🟡" },
  high: { bg: "#fff1f2", badge: "#dc2626", border: "#fecaca", icon: "🔴" },
  critical: { bg: "#1a0010", badge: "#9f1239", border: "#881337", icon: "☠️" },
};

const TYPE_LABELS: Record<string, string> = {
  HASH_MISMATCH: "Evidence Tampering Detected",
  ANOMALY_DETECTED: "Anomalous Access Pattern",
};

function buildEmailTemplate({
  type,
  evidenceId,
  message,
  riskLevel,
  metadata,
}: AlertPayload): string {
  const palette = RISK_PALETTE[riskLevel] ?? RISK_PALETTE["high"];
  const isCritical = riskLevel === "critical";
  const label = TYPE_LABELS[type] ?? type;
  const now = new Date().toUTCString();

  const metaRows = Object.entries(metadata ?? {})
    .map(
      ([k, v]) => `
      <tr>
        <td style="padding:10px 16px;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;white-space:nowrap;border-bottom:1px solid #f3f4f6;">${k}</td>
        <td style="padding:10px 16px;font-size:13px;color:#111827;font-family:monospace;word-break:break-all;border-bottom:1px solid #f3f4f6;">${JSON.stringify(v)}</td>
      </tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Evidrax-Core Security Alert</title>
</head>
<body style="margin:0;padding:0;background-color:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">

  <!-- Wrapper -->
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#0f172a;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px;width:100%;">

          <!-- Top Brand Bar -->
          <tr>
            <td style="background:linear-gradient(135deg,#1e293b 0%,#0f172a 100%);border-radius:16px 16px 0 0;padding:28px 36px;border-bottom:1px solid #334155;">
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td>
                    <span style="font-size:20px;font-weight:800;color:#f8fafc;letter-spacing:-0.03em;">⚖️ Evidrax</span><span style="font-size:20px;font-weight:300;color:#94a3b8;letter-spacing:-0.02em;">-Core</span>
                    <div style="font-size:11px;color:#64748b;margin-top:3px;letter-spacing:0.08em;text-transform:uppercase;">Forensic Evidence Security Platform</div>
                  </td>
                  <td align="right" valign="top">
                    <span style="display:inline-block;background:${palette.badge};color:#fff;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;padding:5px 12px;border-radius:100px;">
                      ${palette.icon} ${riskLevel}
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Alert Hero -->
          <tr>
            <td style="background:${isCritical ? "#1a0010" : "#1e293b"};padding:36px 36px 28px;border-left:4px solid ${palette.badge};">
              <div style="font-size:11px;color:${palette.badge};font-weight:700;letter-spacing:0.12em;text-transform:uppercase;margin-bottom:10px;">Security Alert · ${type}</div>
              <h1 style="margin:0 0 14px;font-size:24px;font-weight:800;color:#f1f5f9;line-height:1.2;">${label}</h1>
              <p style="margin:0;font-size:15px;color:#94a3b8;line-height:1.6;">${message}</p>
            </td>
          </tr>

          <!-- Evidence ID pill (if present) -->
          ${
            evidenceId
              ? `
          <tr>
            <td style="background:${isCritical ? "#1a0010" : "#1e293b"};padding:0 36px 28px;border-left:4px solid ${palette.badge};">
              <div style="display:inline-block;background:#0f172a;border:1px solid #334155;border-radius:8px;padding:12px 18px;">
                <span style="font-size:11px;color:#64748b;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;display:block;margin-bottom:4px;">Evidence ID</span>
                <span style="font-size:13px;color:#e2e8f0;font-family:monospace;">${evidenceId}</span>
              </div>
            </td>
          </tr>`
              : ""
          }

          <!-- Divider -->
          <tr>
            <td style="background:${isCritical ? "#1a0010" : "#1e293b"};border-left:4px solid ${palette.badge};padding:0 36px;">
              <div style="height:1px;background:linear-gradient(to right,${palette.border}44,transparent);"></div>
            </td>
          </tr>

          <!-- Metadata Table -->
          ${
            metaRows
              ? `
          <tr>
            <td style="background:${isCritical ? "#1a0010" : "#1e293b"};padding:28px 36px;border-left:4px solid ${palette.badge};">
              <div style="font-size:11px;color:#64748b;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:14px;">Event Details</div>
              <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border-radius:10px;overflow:hidden;border:1px solid #334155;">
                ${metaRows}
              </table>
            </td>
          </tr>`
              : ""
          }

          <!-- Timestamp Row -->
          <tr>
            <td style="background:${isCritical ? "#1a0010" : "#1e293b"};padding:0 36px 28px;border-left:4px solid ${palette.badge};">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font-size:12px;color:#475569;">
                    <span style="color:#64748b;">🕐 Detected at</span> &nbsp;<strong style="color:#94a3b8;">${now}</strong>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td style="background:${isCritical ? "#1a0010" : "#1e293b"};padding:0 36px 36px;border-left:4px solid ${palette.badge};">
              <a href="#" style="display:inline-block;background:${palette.badge};color:#fff;font-size:14px;font-weight:700;text-decoration:none;padding:13px 26px;border-radius:8px;letter-spacing:0.02em;">
                → Investigate in Admin Panel
              </a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#0f172a;border-radius:0 0 16px 16px;padding:24px 36px;border-top:1px solid #1e293b;">
              <p style="margin:0;font-size:11px;color:#475569;line-height:1.7;">
                This is an automated security alert from <strong style="color:#64748b;">Evidrax-Core</strong>.<br/>
                Do not reply to this email. Log in to the admin panel to investigate and resolve this alert.<br/>
                <span style="color:#334155;">If you believe this alert was triggered in error, contact your system administrator.</span>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>`;
}

// ── Transactional Emails ───────────────────────────────────────────────────────

export async function sendWelcomeEmail({
  email,
  fullName,
  role,
  createdBy,
}: {
  email: string;
  fullName?: string | null;
  role: string;
  createdBy?: string;
}): Promise<void> {
  if (!config.resend.apiKey || config.resend.apiKey === "re_your_resend_key")
    return;
  const name = fullName ?? email;
  try {
    await resend.emails.send({
      from: config.resend.from,
      to: email,
      subject: `Welcome to Evidrax-Core - Your account is ready`,
      html: buildTransactionalEmail({
        preheader: "Your Evidrax-Core account has been created.",
        heading: `Welcome, ${name}`,
        body: `Your account has been created on the <strong>Evidrax-Core</strong> Forensic Evidence Security Platform.
               Your assigned role is <strong>${role}</strong>.${createdBy ? ` Account created by: <code>${createdBy}</code>.` : ""}
               <br/><br/>You can now log in and access the platform.`,
        ctaText: "Go to Login",
        ctaHref: "#",
        badgeText: role,
        badgeColor: "#0ea5e9",
      }),
    });
    logger.info("Welcome email sent", { email });
  } catch (err) {
    logger.error("Failed to send welcome email", {
      error: (err as Error).message,
    });
  }
}

export async function sendLoginNotificationEmail({
  email,
  fullName,
  ipAddress,
  timestamp,
}: {
  email: string;
  fullName?: string | null;
  ipAddress?: string;
  timestamp: Date;
}): Promise<void> {
  if (!config.resend.apiKey || config.resend.apiKey === "re_your_resend_key")
    return;
  const name = fullName ?? email;
  try {
    await resend.emails.send({
      from: config.resend.from,
      to: email,
      subject: `New login to your Evidrax-Core account`,
      html: buildTransactionalEmail({
        preheader: "A new login was detected on your account.",
        heading: `New login detected`,
        body: `Hello <strong>${name}</strong>, a new login was recorded on your Evidrax-Core account.
               <br/><br/>
               <strong>Time:</strong> ${timestamp.toUTCString()}<br/>
               <strong>IP Address:</strong> ${ipAddress ?? "unknown"}<br/><br/>
               If this wasn't you, contact your administrator immediately.`,
        ctaText: "Review Account Activity",
        ctaHref: "#",
        badgeText: "Login Alert",
        badgeColor: "#6366f1",
      }),
    });
    logger.info("Login notification sent", { email });
  } catch (err) {
    logger.error("Failed to send login notification", {
      error: (err as Error).message,
    });
  }
}

export async function sendAccountDisabledEmail({
  email,
  fullName,
}: {
  email: string;
  fullName?: string | null;
}): Promise<void> {
  if (!config.resend.apiKey || config.resend.apiKey === "re_your_resend_key")
    return;
  const name = fullName ?? email;
  try {
    await resend.emails.send({
      from: config.resend.from,
      to: email,
      subject: `Your Evidrax-Core account has been disabled`,
      html: buildTransactionalEmail({
        preheader: "Your account has been deactivated by an administrator.",
        heading: `Account disabled`,
        body: `Hello <strong>${name}</strong>, your account on the Evidrax-Core platform has been <strong>deactivated</strong> by an administrator.
               <br/><br/>You will no longer be able to log in. If you believe this is a mistake, please contact your system administrator.`,
        ctaText: "Contact Support",
        ctaHref: "#",
        badgeText: "Account Disabled",
        badgeColor: "#dc2626",
      }),
    });
    logger.info("Account disabled email sent", { email });
  } catch (err) {
    logger.error("Failed to send account disabled email", {
      error: (err as Error).message,
    });
  }
}

export async function sendEvidenceUploadedEmail({
  email,
  fullName,
  evidenceTitle,
  evidenceId,
  filename,
  fileSize,
  sha256,
  viewUrl,
}: {
  email: string;
  fullName?: string | null;
  evidenceTitle: string;
  evidenceId: string;
  filename: string;
  fileSize: number;
  sha256: string;
  viewUrl: string;
}): Promise<void> {
  if (!config.resend.apiKey || config.resend.apiKey === "re_your_resend_key")
    return;
  const name = fullName ?? email;
  const sizeMb = (fileSize / (1024 * 1024)).toFixed(2);
  try {
    await resend.emails.send({
      from: config.resend.from,
      to: email,
      subject: `Evidence uploaded - ${evidenceTitle}`,
      html: buildTransactionalEmail({
        preheader: `Evidence "${evidenceTitle}" has been successfully uploaded.`,
        heading: `Evidence uploaded successfully`,
        body: `Hello <strong>${name}</strong>, evidence has been successfully uploaded to Evidrax-Core.
               <br/><br/>
               <strong>Title:</strong> ${evidenceTitle}<br/>
               <strong>File:</strong> ${filename} (${sizeMb} MB)<br/>
               <strong>Evidence ID:</strong> <code>${evidenceId}</code><br/>
               <strong>SHA-256:</strong> <code style="word-break:break-all;font-size:11px;">${sha256}</code><br/><br/>
               The file is stored securely on Cloudinary. You can view or download it using the link below.`,
        ctaText: "View Evidence",
        ctaHref: viewUrl,
        badgeText: "Evidence Uploaded",
        badgeColor: "#059669",
      }),
    });
    logger.info("Evidence upload email sent", { email, evidenceId });
  } catch (err) {
    logger.error("Failed to send evidence upload email", {
      error: (err as Error).message,
    });
  }
}

// ── Shared transactional template ─────────────────────────────────────────────

function buildTransactionalEmail({
  preheader,
  heading,
  body,
  ctaText,
  ctaHref,
  badgeText,
  badgeColor,
}: {
  preheader: string;
  heading: string;
  body: string;
  ctaText: string;
  ctaHref: string;
  badgeText: string;
  badgeColor: string;
}): string {
  const now = new Date().toUTCString();
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>${heading}</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <span style="display:none;max-height:0;overflow:hidden;">${preheader}</span>
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f1f5f9;padding:40px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" role="presentation" style="max-width:560px;width:100%;">

        <!-- Header -->
        <tr>
          <td style="background:#0f172a;border-radius:14px 14px 0 0;padding:24px 32px;border-bottom:1px solid #1e293b;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <span style="font-size:18px;font-weight:800;color:#f8fafc;letter-spacing:-0.03em;">⚖️ Evidrax</span><span style="font-size:18px;font-weight:300;color:#94a3b8;">-Core</span>
                  <div style="font-size:10px;color:#64748b;margin-top:2px;letter-spacing:0.08em;text-transform:uppercase;">Forensic Evidence Security Platform</div>
                </td>
                <td align="right" valign="middle">
                  <span style="display:inline-block;background:${badgeColor};color:#fff;font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;padding:4px 12px;border-radius:100px;">${badgeText}</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Body card -->
        <tr>
          <td style="background:#ffffff;padding:32px 32px 24px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">
            <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#0f172a;line-height:1.2;">${heading}</h1>
            <p style="margin:0 0 24px;font-size:14px;color:#475569;line-height:1.7;">${body}</p>
            <a href="${ctaHref}" style="display:inline-block;background:#0f172a;color:#f8fafc;font-size:13px;font-weight:700;text-decoration:none;padding:12px 24px;border-radius:8px;letter-spacing:0.02em;">${ctaText} →</a>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f8fafc;border-radius:0 0 14px 14px;padding:18px 32px;border:1px solid #e2e8f0;border-top:none;">
            <p style="margin:0;font-size:11px;color:#94a3b8;line-height:1.7;">
              This is an automated message from <strong style="color:#64748b;">Evidrax-Core</strong>. Do not reply to this email.
              <br/><span style="color:#cbd5e1;">Sent at ${now}</span>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
