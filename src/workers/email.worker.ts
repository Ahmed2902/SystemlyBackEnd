import crypto from "crypto";
// @ts-ignore
import SibApiV3Sdk from "sib-api-v3-sdk";
import { EMAIL } from "../shared/config/config";
import { prisma } from "../shared/db/prisma";
import redis from "../shared/config/redis";

import {
  verificationEmail,
  welcomeEmail,
  passwordResetEmail,
  appointmentConfirmationEmail,
  appointmentReminderEmail,
  staffInviteEmail,
  trialStartedEmail,
  trialEndingEmail,
  trialExpiredEmail,
  subscriptionActivatedEmail,
  subscriptionPaymentFailedEmail,
} from "../shared/utils/email.templates";

let brevoClient: any | null = null;

const initBrevoClient = () => {
  if (!EMAIL.BREVO_API_KEY) {
    console.error("❌ Missing BREVO_API_KEY");
    return null;
  }

  try {
    const client = SibApiV3Sdk.ApiClient.instance;
    client.authentications["api-key"].apiKey = EMAIL.BREVO_API_KEY;
    brevoClient = new SibApiV3Sdk.TransactionalEmailsApi();
    return brevoClient;
  } catch (err) {
    console.error("❌ Brevo init failed:", err);
    brevoClient = null;
    return null;
  }
};

const sendWithTimeout = async (promise: Promise<any>, ms = 30000) => {
  let timeoutId: NodeJS.Timeout | null = null;
  const timeout = new Promise((_res, rej) => {
    timeoutId = setTimeout(
      () => rej(new Error("Email provider request timed out")),
      ms,
    );
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

const sendViaBrevo = async (
  to: string | string[],
  subject: string,
  html: string,
  fromAddress?: string,
) => {
  const from = fromAddress || EMAIL.FROM_EMAIL || "noreply@hgezli.com";

  if (!brevoClient) initBrevoClient();
  if (!brevoClient) throw new Error("Brevo client not initialized");

  const toList = Array.isArray(to)
    ? to.map((email) => ({ email }))
    : [{ email: to }];

  const payload = {
    sender: { email: from },
    to: toList,
    subject,
    htmlContent: html,
  };

  const response = await sendWithTimeout(brevoClient.sendTransacEmail(payload));
  return response;
};

/**
 * Graphile Worker task handler for `send_email` jobs.
 * Payload shape:
 * { type: string, to: string|string[], data: object, tenantId?: string, idempotencyKey?: string }
 */
export const sendEmailTask = async (payload: any, _helpers: any) => {
  const {
    type,
    to: toRaw,
    data = {},
    tenantId,
    idempotencyKey,
  } = payload || {};

  // Build idempotency key (use provided or derive from payload)
  const keySource =
    idempotencyKey || JSON.stringify({ type, to: toRaw, data, tenantId });
  const hash = crypto.createHash("sha256").update(keySource).digest("hex");
  const redisKey = `email:sent:${hash}`;

  // Fast-path: skip if we've recently sent the same email
  try {
    const already = await redis.get(redisKey);
    if (already) {
      console.log(
        "[EmailWorker] Skipping duplicate send (idempotency)",
        redisKey,
      );
      return;
    }
  } catch (err) {
    console.warn(
      "[EmailWorker] Redis check failed, continuing without idempotency check",
      err,
    );
  }

  let to = toRaw;
  let subject = "";
  let html = "";
  const fromAddress = EMAIL.FROM_EMAIL || "noreply@hgezli.com";

  try {
    switch (type) {
      case "verification": {
        if (!to && data.userId) {
          const user = await prisma.businessUser.findUnique({
            where: { id: data.userId },
          });
          if (!user) throw new Error("User not found for verification email");
          to = user.email;
        }
        subject = "Verify your email to activate your Hgezli account";
        html = verificationEmail({
          name: data.name || "there",
          verificationUrl: data.verificationUrl,
        });
        break;
      }

      case "welcome": {
        subject = "Welcome to Hgezli — your account is active";
        html = welcomeEmail({
          name: data.name || "there",
          dashboardUrl: data.dashboardUrl || process.env.FRONTEND_URL || "",
          websiteUrl: data.websiteUrl || process.env.FRONTEND_URL || "",
        });
        break;
      }

      case "password_reset": {
        subject = "Reset your Hgezli password";
        html = passwordResetEmail({
          name: data.name || "there",
          resetUrl: data.resetUrl,
        });
        break;
      }

      case "appointment": {
        // subtype: "confirmation" | "reminder"
        const subtype = data.subtype || data.type || "confirmation";
        let appt: any = null;
        if (data.appointmentId) {
          appt = await prisma.appointment.findUnique({
            where: { id: data.appointmentId },
            include: {
              customer: true,
              business: true,
              appointmentServices: { include: { service: true } },
              staff: true,
            },
          });
          if (!appt) throw new Error("Appointment not found for email");
          if (tenantId && String(appt.businessId) !== String(tenantId)) {
            throw new Error("Tenant mismatch for appointment email");
          }
        }

        const name = data.name || appt?.customer?.name || "there";
        const businessName = data.businessName || appt?.business?.name || "";
        const serviceName =
          data.serviceName ||
          appt?.appointmentServices?.[0]?.service?.name ||
          "";
        const staffName = data.staffName || appt?.staff?.name || null;
        const startsAt =
          data.startsAt || (appt?.startsAt ? appt.startsAt.toISOString() : "");

        if (subtype === "reminder") {
          subject = `Reminder: appointment at ${businessName}`;
          html = appointmentReminderEmail({
            name,
            businessName,
            serviceName,
            staffName,
            startsAt,
            whenLabel: data.whenLabel,
          });
        } else {
          subject = `Your appointment at ${businessName}`;
          html = appointmentConfirmationEmail({
            name,
            businessName,
            serviceName,
            staffName,
            startsAt,
            cancelUrl: data.cancelUrl,
          });
        }

        // Determine recipient
        if (!to) {
          to = appt?.customer?.email;
        }

        // Post-send bookkeeping will be handled after successful send (ReminderLog updates, redis keys, appointment flags)
        break;
      }

      case "subscription": {
        const subtype = data.subtype || "default";
        if (subtype === "staff_invite") {
          subject = `${data.businessName || "Hgezli"}: Invitation to join`;
          html = staffInviteEmail({
            inviterName: data.inviterName,
            businessName: data.businessName,
            acceptUrl: data.acceptUrl,
          });
        } else if (subtype === "trial_started") {
          subject = `Your ${data.planName} trial has started`;
          html = trialStartedEmail({
            name: data.name || "there",
            businessName: data.businessName || "",
            planName: data.planName || "",
            trialEnd: data.trialEnd || "",
          });
        } else if (subtype === "trial_ending") {
          subject = `Trial ending in ${data.daysLeft} day(s) — ${data.businessName}`;
          html = trialEndingEmail({
            name: data.name || "there",
            businessName: data.businessName || "",
            planName: data.planName || "",
            trialEnd: data.trialEnd || "",
            daysLeft: data.daysLeft || 0,
          });
        } else if (subtype === "trial_expired") {
          subject = `Trial ended — ${data.businessName}`;
          html = trialExpiredEmail({
            name: data.name || "there",
            businessName: data.businessName || "",
            planName: data.planName || "",
            expiredAt: data.expiredAt || "",
          });
        } else if (subtype === "subscription_activated") {
          subject = `Subscription active — ${data.businessName}`;
          html = subscriptionActivatedEmail({
            name: data.name || "there",
            businessName: data.businessName || "",
            planName: data.planName || "",
            periodEnd: data.periodEnd || "",
          });
        } else if (subtype === "subscription_payment_failed") {
          subject = `Payment failed — ${data.businessName}`;
          html = subscriptionPaymentFailedEmail({
            name: data.name || "there",
            businessName: data.businessName || "",
            planName: data.planName || "",
          });
        }
        break;
      }

      case "invoice": {
        // For invoice emails we expect caller to supply subject/html in data or use a custom template
        if (data.html && data.subject) {
          html = data.html;
          subject = data.subject;
        } else if (data.invoiceId) {
          const inv = await prisma.invoice.findUnique({
            where: { id: data.invoiceId },
            include: { customer: true, business: true },
          });
          if (!inv) throw new Error("Invoice not found for email");
          if (tenantId && String(inv.businessId) !== String(tenantId))
            throw new Error("Tenant mismatch for invoice email");
          // No default template available; caller should pass html/subject
          throw new Error(
            "No invoice email template available; include html and subject in job data",
          );
        }
        break;
      }

      default: {
        // Allow raw html/subject passed in data
        if (data.html && data.subject) {
          html = data.html;
          subject = data.subject;
        } else {
          throw new Error(`Unknown email type: ${type}`);
        }
      }
    }

    if (!to) throw new Error("Recipient (to) not specified for email");

    // Send via Brevo
    await sendViaBrevo(to, subject, html, fromAddress);

    // Mark as sent in idempotency store
    try {
      // keep idempotency key for 7 days by default
      await redis.set(redisKey, "1", 60 * 60 * 24 * 7);
    } catch (err) {
      console.warn("[EmailWorker] Failed to set idempotency key in redis", err);
    }

    // Appointment-specific post-send actions
    if (type === "appointment") {
      const subtype = data.subtype || data.type || "confirmation";
      const apptId = data.appointmentId;
      if (apptId) {
        // update ReminderLog if exists
        try {
          await prisma.reminderLog.updateMany({
            where: {
              appointmentId: apptId,
              whenKey:
                data.whenKey ||
                (subtype === "confirmation" ? "confirm" : data.whenKey),
              status: "pending",
            },
            data: { status: "sent", sentAt: new Date() },
          });
        } catch (err) {
          // ignore - best-effort
        }

        // set redis marker similar to previous logic
        try {
          const appt = await prisma.appointment.findUnique({
            where: { id: apptId },
          });
          if (appt && appt.startsAt) {
            const seconds =
              Math.max(
                60,
                Math.floor(
                  (new Date(appt.startsAt).getTime() - Date.now()) / 1000,
                ),
              ) +
              60 * 60;
            if (subtype === "confirmation") {
              await redis.set(`appt:confirm:${appt.id}`, "1", seconds);
              await prisma.appointment.update({
                where: { id: appt.id },
                data: { confirmationSent: true },
              });
            } else {
              const whenKey = data.whenKey || "";
              await redis.set(
                `appt:remind:${whenKey}:${appt.id}`,
                "1",
                seconds,
              );
              await prisma.appointment.update({
                where: { id: appt.id },
                data: { reminderSent: true },
              });
            }
          }
        } catch (err) {
          console.warn(
            "[EmailWorker] Post-send appointment updates failed",
            err,
          );
        }
      }
    }

    console.log("[EmailWorker] Email sent", { type, to, tenantId });
    return { ok: true };
  } catch (err: any) {
    console.error("[EmailWorker] Failed to send email", {
      type,
      to,
      tenantId,
      err: err?.message || err,
    });

    // On failure, if this was an appointment, mark ReminderLog as failed
    if (type === "appointment" && data.appointmentId) {
      try {
        await prisma.reminderLog.updateMany({
          where: {
            appointmentId: data.appointmentId,
            whenKey: data.whenKey || "",
            status: "pending",
          },
          data: { status: "failed", errorMessage: String(err?.message || err) },
        });
      } catch (_e) {
        // ignore
      }
    }

    // Let Graphile Worker handle retries
    throw err;
  }
};

export default sendEmailTask;
