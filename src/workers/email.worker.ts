import crypto from "crypto";
// @ts-ignore
import SibApiV3Sdk from "sib-api-v3-sdk";
import { EMAIL } from "../shared/config/config";
import { prisma } from "../shared/db/prisma";
import redis from "../shared/config/redis";

import {
  appointmentConfirmationEmailContent,
  appointmentReminderEmailContent,
  normalizeEmailLocale,
  passwordResetEmailContent,
  staffInviteEmailContent,
  subscriptionEmailContent,
  verificationEmailContent,
  welcomeEmailContent,
} from "../shared/utils/localized-email.templates";

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
  const fromAddress = EMAIL.FROM_EMAIL || "noreply@systemly.app";
  const requestedLocale = normalizeEmailLocale(data.locale);

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
        const content = verificationEmailContent({
          locale: requestedLocale,
          name: data.name || "",
          verificationUrl: data.verificationUrl,
        });
        subject = content.subject;
        html = content.html;
        break;
      }

      case "welcome": {
        const content = welcomeEmailContent({
          locale: requestedLocale,
          name: data.name || "",
          dashboardUrl: data.dashboardUrl || process.env.FRONTEND_URL || "",
        });
        subject = content.subject;
        html = content.html;
        break;
      }

      case "password_reset": {
        const content = passwordResetEmailContent({
          locale: requestedLocale,
          name: data.name || "",
          resetUrl: data.resetUrl,
        });
        subject = content.subject;
        html = content.html;
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

        const appointmentLocale = normalizeEmailLocale(
          data.locale ?? appt?.business?.language,
        );
        const content =
          subtype === "reminder"
            ? appointmentReminderEmailContent({
                locale: appointmentLocale,
                name,
                businessName,
                serviceName,
                staffName,
                startsAt,
                whenLabel: data.whenLabel,
              })
            : appointmentConfirmationEmailContent({
                locale: appointmentLocale,
                name,
                businessName,
                serviceName,
                staffName,
                startsAt,
                cancelUrl: data.cancelUrl,
              });
        subject = content.subject;
        html = content.html;

        // Determine recipient
        if (!to) {
          to = appt?.customer?.email;
        }

        // Post-send bookkeeping will be handled after successful send (ReminderLog updates, redis keys, appointment flags)
        break;
      }

      case "subscription": {
        const subtype = data.subtype || "default";
        const locale = normalizeEmailLocale(data.locale);
        const content =
          subtype === "staff_invite"
            ? staffInviteEmailContent({
                locale,
                inviterName: data.inviterName,
                businessName: data.businessName || "Systemly",
                acceptUrl: data.acceptUrl,
              })
            : subscriptionEmailContent({
                locale,
                subtype,
                name: data.name,
                businessName: data.businessName,
                planName: data.planName,
                trialEnd: data.trialEnd,
                daysLeft: data.daysLeft,
                expiredAt: data.expiredAt,
                periodEnd: data.periodEnd,
              });
        subject = content.subject;
        html = content.html;
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
