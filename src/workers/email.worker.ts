import crypto from "crypto";
import { prisma } from "../shared/db/prisma";
import redis from "../shared/config/redis";
import { EMAIL } from "../shared/config/config";
import { sendTransactionalEmail } from "../shared/email/email.provider";
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

type EmailTaskPayload = {
  type: string;
  to?: string | string[];
  data?: Record<string, any>;
  tenantId?: string | number | null;
  idempotencyKey?: string;
};

type EmailMessage = {
  to: string | string[];
  subject: string;
  html: string;
};

function idempotencyRedisKey(payload: EmailTaskPayload) {
  const source =
    payload.idempotencyKey ||
    JSON.stringify({
      type: payload.type,
      to: payload.to,
      data: payload.data || {},
      tenantId: payload.tenantId ?? null,
    });
  return `email:sent:${crypto.createHash("sha256").update(source).digest("hex")}`;
}

async function appointmentContext(payload: EmailTaskPayload) {
  const data = payload.data || {};
  if (!data.appointmentId) return null;

  const appointment = await prisma.appointment.findUnique({
    where: { id: data.appointmentId },
    include: {
      customer: true,
      business: true,
      appointmentServices: { include: { service: true } },
      staff: true,
    },
  });

  if (!appointment) throw new Error("Appointment not found for email");
  if (
    payload.tenantId &&
    String(appointment.businessId) !== String(payload.tenantId)
  ) {
    throw new Error("Tenant mismatch for appointment email");
  }

  return appointment;
}

async function buildAppointmentMessage(
  payload: EmailTaskPayload,
): Promise<EmailMessage> {
  const data = payload.data || {};
  const appointment = await appointmentContext(payload);
  const subtype = data.subtype || data.type || "confirmation";
  const to = payload.to || appointment?.customer?.email;
  if (!to) throw new Error("Appointment has no customer email");

  const name = data.name || appointment?.customer?.name || "there";
  const businessName = data.businessName || appointment?.business?.name || "";
  const serviceName =
    data.serviceName ||
    appointment?.appointmentServices?.[0]?.service?.name ||
    "";
  const staffName = data.staffName || appointment?.staff?.name || null;
  const startsAt =
    data.startsAt ||
    (appointment?.startsAt ? appointment.startsAt.toISOString() : "");

  if (subtype === "reminder") {
    return {
      to,
      subject: `Reminder: appointment at ${businessName}`,
      html: appointmentReminderEmail({
        name,
        businessName,
        serviceName,
        staffName,
        startsAt,
        whenLabel: data.whenLabel,
      }),
    };
  }

  return {
    to,
    subject: `Your appointment at ${businessName}`,
    html: appointmentConfirmationEmail({
      name,
      businessName,
      serviceName,
      staffName,
      startsAt,
      cancelUrl: data.cancelUrl,
    }),
  };
}

function buildSubscriptionMessage(payload: EmailTaskPayload): EmailMessage {
  const data = payload.data || {};
  const to = payload.to;
  if (!to) throw new Error("Recipient not specified for subscription email");

  switch (data.subtype || "default") {
    case "staff_invite":
      return {
        to,
        subject: `${data.businessName || "Hgezli"}: Invitation to join`,
        html: staffInviteEmail({
          inviterName: data.inviterName,
          businessName: data.businessName,
          acceptUrl: data.acceptUrl,
        }),
      };
    case "trial_started":
      return {
        to,
        subject: `Your ${data.planName} trial has started`,
        html: trialStartedEmail({
          name: data.name || "there",
          businessName: data.businessName || "",
          planName: data.planName || "",
          trialEnd: data.trialEnd || "",
        }),
      };
    case "trial_ending":
      return {
        to,
        subject: `Trial ending in ${data.daysLeft} day(s) — ${data.businessName}`,
        html: trialEndingEmail({
          name: data.name || "there",
          businessName: data.businessName || "",
          planName: data.planName || "",
          trialEnd: data.trialEnd || "",
          daysLeft: data.daysLeft || 0,
        }),
      };
    case "trial_expired":
      return {
        to,
        subject: `Trial ended — ${data.businessName}`,
        html: trialExpiredEmail({
          name: data.name || "there",
          businessName: data.businessName || "",
          planName: data.planName || "",
          expiredAt: data.expiredAt || "",
        }),
      };
    case "subscription_activated":
      return {
        to,
        subject: `Subscription active — ${data.businessName}`,
        html: subscriptionActivatedEmail({
          name: data.name || "there",
          businessName: data.businessName || "",
          planName: data.planName || "",
          periodEnd: data.periodEnd || "",
        }),
      };
    case "subscription_payment_failed":
      return {
        to,
        subject: `Payment failed — ${data.businessName}`,
        html: subscriptionPaymentFailedEmail({
          name: data.name || "there",
          businessName: data.businessName || "",
          planName: data.planName || "",
        }),
      };
    default:
      throw new Error(`Unknown subscription email subtype: ${data.subtype}`);
  }
}

async function buildEmailMessage(
  payload: EmailTaskPayload,
): Promise<EmailMessage> {
  const data = payload.data || {};

  switch (payload.type) {
    case "verification": {
      let to = payload.to;
      if (!to && data.userId) {
        const user = await prisma.businessUser.findUnique({
          where: { id: data.userId },
        });
        if (!user) throw new Error("User not found for verification email");
        to = user.email;
      }
      if (!to) throw new Error("Recipient not specified for verification email");
      return {
        to,
        subject: "Verify your email to activate your Hgezli account",
        html: verificationEmail({
          name: data.name || "there",
          verificationUrl: data.verificationUrl,
        }),
      };
    }
    case "welcome":
      if (!payload.to) throw new Error("Recipient not specified for welcome email");
      return {
        to: payload.to,
        subject: "Welcome to Hgezli — your account is active",
        html: welcomeEmail({
          name: data.name || "there",
          dashboardUrl: data.dashboardUrl || process.env.FRONTEND_URL || "",
          websiteUrl: data.websiteUrl || process.env.FRONTEND_URL || "",
        }),
      };
    case "password_reset":
      if (!payload.to) throw new Error("Recipient not specified for reset email");
      return {
        to: payload.to,
        subject: "Reset your Hgezli password",
        html: passwordResetEmail({
          name: data.name || "there",
          resetUrl: data.resetUrl,
        }),
      };
    case "appointment":
      return buildAppointmentMessage(payload);
    case "subscription":
      return buildSubscriptionMessage(payload);
    case "invoice":
      if (!payload.to || !data.subject || !data.html) {
        throw new Error(
          "Invoice email requires recipient, subject, and html content",
        );
      }
      return { to: payload.to, subject: data.subject, html: data.html };
    default:
      if (!payload.to || !data.subject || !data.html) {
        throw new Error(`Unknown email type: ${payload.type}`);
      }
      return { to: payload.to, subject: data.subject, html: data.html };
  }
}

async function markAppointmentEmailSent(payload: EmailTaskPayload) {
  if (payload.type !== "appointment" || !payload.data?.appointmentId) return;
  const data = payload.data;
  const subtype = data.subtype || data.type || "confirmation";
  const appointment = await prisma.appointment.findUnique({
    where: { id: data.appointmentId },
  });
  if (!appointment) return;

  await prisma.reminderLog.updateMany({
    where: {
      appointmentId: appointment.id,
      whenKey:
        data.whenKey || (subtype === "confirmation" ? "confirm" : ""),
      status: "pending",
    },
    data: { status: "sent", sentAt: new Date() },
  });

  const seconds =
    Math.max(
      60,
      Math.floor((appointment.startsAt.getTime() - Date.now()) / 1000),
    ) +
    60 * 60;

  if (subtype === "confirmation") {
    await redis.set(`appt:confirm:${appointment.id}`, "1", seconds);
    await prisma.appointment.update({
      where: { id: appointment.id },
      data: { confirmationSent: true },
    });
    return;
  }

  await redis.set(
    `appt:remind:${data.whenKey || ""}:${appointment.id}`,
    "1",
    seconds,
  );
  await prisma.appointment.update({
    where: { id: appointment.id },
    data: { reminderSent: true },
  });
}

async function markAppointmentEmailFailed(
  payload: EmailTaskPayload,
  error: unknown,
) {
  if (payload.type !== "appointment" || !payload.data?.appointmentId) return;
  await prisma.reminderLog.updateMany({
    where: {
      appointmentId: payload.data.appointmentId,
      whenKey: payload.data.whenKey || "",
      status: "pending",
    },
    data: {
      status: "failed",
      errorMessage: error instanceof Error ? error.message : String(error),
    },
  });
}

export const sendEmailTask = async (
  payload: EmailTaskPayload,
  _helpers: unknown,
) => {
  const redisKey = idempotencyRedisKey(payload);
  try {
    if (await redis.get(redisKey)) {
      console.log("[EmailWorker] Skipping duplicate send", {
        type: payload.type,
        tenantId: payload.tenantId,
      });
      return { ok: true, duplicate: true };
    }
  } catch (error) {
    console.warn("[EmailWorker] Idempotency check failed; sending anyway", error);
  }

  try {
    const message = await buildEmailMessage(payload);
    const delivery = await sendTransactionalEmail({
      ...message,
      from: EMAIL.FROM_EMAIL,
    });

    try {
      await redis.set(redisKey, "1", 60 * 60 * 24 * 7);
    } catch (error) {
      console.warn("[EmailWorker] Could not persist idempotency marker", error);
    }

    await markAppointmentEmailSent(payload);
    console.log("[EmailWorker] Email accepted by provider", {
      type: payload.type,
      tenantId: payload.tenantId,
      provider: delivery.provider,
      messageId: delivery.messageId,
    });
    return { ok: true, ...delivery };
  } catch (error) {
    await markAppointmentEmailFailed(payload, error).catch(() => undefined);
    console.error("[EmailWorker] Email delivery failed", {
      type: payload.type,
      tenantId: payload.tenantId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
};

export default sendEmailTask;
