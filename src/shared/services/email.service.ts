import nodemailer from "nodemailer";
import {
  verificationEmail,
  welcomeEmail,
  passwordResetEmail,
} from "../utils/email.templates";

import { EMAIL } from "../config/constants";

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

  const transport = getTransporter();
  const fromAddress = EMAIL.FROM_EMAIL || "noreply@hgezli.com";

  if (!transport) {
    logStub(user.email, subject, { verificationUrl });
    return { sent: false };
  }

  try {
    // eslint-disable-next-line no-console
    console.log("[Email][SMTP] Sending verification email to:", user.email);

    const resp = await sendWithTimeout(
      transport.sendMail({ from: fromAddress, to: user.email, subject, html }),
      10000
    );

    return { sent: true, data: resp };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("SMTP send error:", err);
    return { sent: false, error: String(err) };
  }
};

export const sendWelcomeEmail = async (user: {
  name: string;
  email: string;
}): Promise<SendResult> => {
  const dashboardUrl = `${process.env.FRONTEND_URL}/dashboard`;
  const websiteUrl = process.env.APP_URL || process.env.FRONTEND_URL || "";
  const html = welcomeEmail({ name: user.name, dashboardUrl, websiteUrl });
  const subject = "Welcome to Hgezli — your account is active";

  const transport = getTransporter();
  const fromAddress = EMAIL.FROM_EMAIL || "noreply@hgezli.com";

  if (!transport) {
    logStub(user.email, subject, { dashboardUrl, websiteUrl });
    return { sent: false };
  }

  try {
    // eslint-disable-next-line no-console
    console.log("[Email][SMTP] Sending welcome email to:", user.email);
    const resp = await sendWithTimeout(
      transport.sendMail({ from: fromAddress, to: user.email, subject, html }),
      10000
    );
    return { sent: true, data: resp };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("SMTP send error:", err);
    return { sent: false, error: String(err) };
  }
};

export const sendPasswordResetEmail = async (
  user: { name: string; email: string },
  resetToken: string
): Promise<SendResult> => {
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
  const html = passwordResetEmail({ name: user.name, resetUrl });
  const subject = "Reset your Hgezli password";

  const transport = getTransporter();
  const fromAddress = EMAIL.FROM_EMAIL || "noreply@hgezli.com";

  if (!transport) {
    logStub(user.email, subject, { resetUrl });
    return { sent: false };
  }

  try {
    // eslint-disable-next-line no-console
    console.log("[Email][SMTP] Sending password reset email to:", user.email);
    const resp = await sendWithTimeout(
      transport.sendMail({ from: fromAddress, to: user.email, subject, html }),
      10000
    );
    return { sent: true, data: resp };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("SMTP send error:", err);
    return { sent: false, error: String(err) };
  }
};

export default {
  sendVerificationEmail,
  sendWelcomeEmail,
  sendPasswordResetEmail,
};
