import nodemailer from "nodemailer";
import Brevo from "@getbrevo/brevo";
// @ts-ignore
import SibApiV3Sdk from "sib-api-v3-sdk";
// @ts-ignore
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
} from "../utils/email.templates";

import { EMAIL } from "../config/config";

type SendResult = { sent: true; data?: any } | { sent: false; error?: any };

let transporter: nodemailer.Transporter | null = null;

const getTransporter = (): nodemailer.Transporter | null => {
  if (transporter) return transporter;

  try {
    if (EMAIL.SMTP_URL) {
      transporter = nodemailer.createTransport(EMAIL.SMTP_URL as any);
      return transporter;
    }

    if (EMAIL.SMTP_HOST) {
      const options: any = {
        host: EMAIL.SMTP_HOST,
        port: EMAIL.SMTP_PORT ?? 587,
        secure: !!EMAIL.SMTP_SECURE,
      };

      if (EMAIL.SMTP_USER) {
        options.auth = { user: EMAIL.SMTP_USER, pass: EMAIL.SMTP_PASS };
      }

      transporter = nodemailer.createTransport(options as any);
      return transporter;
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Failed to create SMTP transport:", err);
    transporter = null;
  }

  return null;
};

const sendWithTimeout = async (promise: Promise<any>, ms = 10000) => {
  let timeoutId: NodeJS.Timeout | null = null;
  const timeout = new Promise((_res, rej) => {
    timeoutId = setTimeout(
      () => rej(new Error("Email provider request timed out")),
      ms
    );
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId!);
  }
};

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

    console.log("✅ Brevo client initialized");

    return brevoClient;
  } catch (err) {
    console.error("❌ Brevo init failed:", err);
    brevoClient = null;
    return null;
  }
};

// =====================
// Core send email function
// =====================
export const sendEmail = async (
  to: string | string[],
  subject: string,
  html: string,
  fromAddress?: string
): Promise<SendResult> => {
  const from = fromAddress || EMAIL.FROM_EMAIL || "ahmedabdelrahma@gmail.com";

  try {
    if (!brevoClient) initBrevoClient();
    if (!brevoClient) {
      throw new Error("Brevo client not initialized");
    }

    const toList = Array.isArray(to)
      ? to.map((email) => ({ email }))
      : [{ email: to }];

    const payload = {
      sender: { email: from },
      to: toList,
      subject,
      htmlContent: html,
    };

    console.log("📨 Sending email via Brevo...");
    console.log("➡️ To:", toList);
    console.log("➡️ Subject:", subject);

    const response = await brevoClient.sendTransacEmail(payload);

    console.log("✅ Brevo response:", response);

    return { sent: true, data: response };
  } catch (err: any) {
    console.error("❌ BREVO SEND FAILED:", err?.response?.body || err);

    return {
      sent: false,
      error: err?.response?.body || String(err),
    };
  }
};

// Fallback to SMTP transporter if available
// const transport = getTransporter();
// {
//   if (!transport) {
//     logStub(typeof to === "string" ? to : to.join(","), subject, {
//       htmlSnippet: html ? html.slice(0, 200) : undefined,
//     });
//     return { sent: false };
//   }

//   try {
//     const resp = await sendWithTimeout(
//       transport.sendMail({
//         from,
//         to: Array.isArray(to) ? (to as string[]).join(",") : (to as string),
//         subject,
//         html,
//       }),
//       10000
//     );
//     return { sent: true, data: resp };
//   } catch (err) {
//     // eslint-disable-next-line no-console
//     console.error("SMTP send error:", err);
//     return { sent: false, error: String(err) };
//   }
// }
const logStub = (
  to: string,
  subject: string,
  bodyInfo?: Record<string, unknown>
) => {
  // Email stub used in development when SMTP is not configured
  // eslint-disable-next-line no-console
  console.log(
    `[Email STUB] To: ${to} Subject: ${subject} ${
      bodyInfo ? JSON.stringify(bodyInfo) : ""
    }`
  );
};

export const sendVerificationEmail = async (
  user: { name: string; email: string },
  token: string
): Promise<SendResult> => {
  const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${token}`;
  const html = verificationEmail({ name: user.name, verificationUrl });
  const subject = "Verify your email to activate your Hgezli account";

  const fromAddress = EMAIL.FROM_EMAIL || "ahmedabdelrahma@gmail.com";
  const resp = await sendEmail(user.email, subject, html, fromAddress);
  return resp;
};

export const sendWelcomeEmail = async (user: {
  name: string;
  email: string;
}): Promise<SendResult> => {
  const dashboardUrl = `${process.env.FRONTEND_URL}/dashboard`;
  const websiteUrl = process.env.FRONTEND_URL || process.env.APP_URL || "";
  const html = welcomeEmail({ name: user.name, dashboardUrl, websiteUrl });
  const subject = "Welcome to Mercora — your account is active";

  const fromAddress = EMAIL.FROM_EMAIL || "noreply@mercora.com";
  const resp = await sendEmail(user.email, subject, html, fromAddress);
  return resp;
};

export const sendPasswordResetEmail = async (
  user: { name: string; email: string },
  resetToken: string
): Promise<SendResult> => {
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
  const html = passwordResetEmail({ name: user.name, resetUrl });
  const subject = "Reset your Hgezli password";

  const fromAddress = EMAIL.FROM_EMAIL || "noreply@hgezli.com";
  const resp = await sendEmail(user.email, subject, html, fromAddress);
  return resp;
};

export const sendAppointmentConfirmation = async (
  to: string,
  payload: {
    name: string;
    businessName: string;
    serviceName: string;
    staffName?: string | null;
    startsAt: string;
    cancelUrl?: string | null;
  }
): Promise<SendResult> => {
  const html = appointmentConfirmationEmail(payload as any);
  const subject = `Your appointment at ${payload.businessName}`;
  const fromAddress = EMAIL.FROM_EMAIL || "noreply@hgezli.com";
  const resp = await sendEmail(to, subject, html, fromAddress);
  return resp;
};

export const sendAppointmentReminder = async (
  to: string,
  payload: {
    name: string;
    businessName: string;
    serviceName: string;
    staffName?: string | null;
    startsAt: string;
    whenLabel?: string;
  }
): Promise<SendResult> => {
  const html = appointmentReminderEmail(payload as any);
  const subject = `Reminder: appointment at ${payload.businessName}`;
  const fromAddress = EMAIL.FROM_EMAIL || "noreply@hgezli.com";
  const resp = await sendEmail(to, subject, html, fromAddress);
  return resp;
};

export const sendStaffInviteEmail = async (
  to: string,
  payload: {
    inviterName?: string | null;
    businessName?: string | null;
    acceptUrl: string;
  }
): Promise<SendResult> => {
  const html = staffInviteEmail(payload as any);
  const subject = `${payload.businessName || "Hgezli"}: Invitation to join`;
  const fromAddress = EMAIL.FROM_EMAIL || "noreply@hgezli.com";
  // eslint-disable-next-line no-console
  console.log("[Email] Sending staff invite to:", to);
  const resp = await sendEmail(to, subject, html, fromAddress);
  return resp;
};

export const sendTrialStartedEmail = async (
  user: { name: string; email: string },
  payload: { businessName: string; planName: string; trialEnd: string }
): Promise<SendResult> => {
  const html = trialStartedEmail(payload as any);
  const subject = `Your ${payload.planName} trial has started`;
  const fromAddress = EMAIL.FROM_EMAIL || "noreply@hgezli.com";
  const resp = await sendEmail(user.email, subject, html, fromAddress);
  return resp;
};

export const sendTrialEndingEmail = async (
  user: { name: string; email: string },
  payload: {
    businessName: string;
    planName: string;
    trialEnd: string;
    daysLeft: number;
  }
): Promise<SendResult> => {
  const html = trialEndingEmail(payload as any);
  const subject = `Trial ending in ${payload.daysLeft} day(s) — ${payload.businessName}`;
  const fromAddress = EMAIL.FROM_EMAIL || "noreply@hgezli.com";
  const resp = await sendEmail(user.email, subject, html, fromAddress);
  return resp;
};

export const sendTrialExpiredEmail = async (
  user: { name: string; email: string },
  payload: { businessName: string; planName: string; expiredAt: string }
): Promise<SendResult> => {
  const html = trialExpiredEmail(payload as any);
  const subject = `Trial ended — ${payload.businessName}`;
  const fromAddress = EMAIL.FROM_EMAIL || "noreply@hgezli.com";
  const resp = await sendEmail(user.email, subject, html, fromAddress);
  return resp;
};

export default {
  sendVerificationEmail,
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendAppointmentConfirmation,
  sendAppointmentReminder,
};

export const sendSubscriptionActivatedEmail = async (
  user: { name: string; email: string },
  payload: { businessName: string; planName: string; periodEnd: string }
): Promise<SendResult> => {
  const html = subscriptionActivatedEmail(payload as any);
  const subject = `Subscription active — ${payload.businessName}`;
  const fromAddress = EMAIL.FROM_EMAIL || "noreply@hgezli.com";
  const resp = await sendEmail(user.email, subject, html, fromAddress);
  return resp;
};

export const sendSubscriptionPaymentFailedEmail = async (
  user: { name: string; email: string },
  payload: { businessName: string; planName: string }
): Promise<SendResult> => {
  const html = subscriptionPaymentFailedEmail(payload as any);
  const subject = `Payment failed — ${payload.businessName}`;
  const fromAddress = EMAIL.FROM_EMAIL || "noreply@hgezli.com";
  const resp = await sendEmail(user.email, subject, html, fromAddress);
  return resp;
};

// extend default export with new functions
Object.assign(exports.default, {
  sendSubscriptionActivatedEmail,
  sendSubscriptionPaymentFailedEmail,
  sendStaffInviteEmail,
});
