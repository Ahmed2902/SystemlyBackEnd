import { enqueueSendEmail, type EmailJobOptions } from "../../queues/emailQueue";
import { prisma } from "../db/prisma";
import {
  normalizeEmailLocale,
  type EmailLocale,
} from "../utils/localized-email.templates";

type LocalizedUser = {
  name: string;
  email: string;
  preferredLanguage?: string | null;
};

function localeFromUser(user: LocalizedUser): EmailLocale {
  return normalizeEmailLocale(user.preferredLanguage);
}

async function resolveLocalizedUser(user: LocalizedUser): Promise<LocalizedUser> {
  if (user.preferredLanguage) return user;

  const stored = await prisma.businessUser.findUnique({
    where: { email: user.email },
    select: { preferredLanguage: true },
  });

  return { ...user, preferredLanguage: stored?.preferredLanguage ?? "en" };
}

function frontendUrl(): string {
  const value = process.env.FRONTEND_URL;
  if (!value) throw new Error("FRONTEND_URL is required for email links");
  return value.replace(/\/+$/, "");
}

export async function enqueueVerificationEmail(
  user: LocalizedUser,
  token: string,
  options: EmailJobOptions = {},
) {
  const localizedUser = await resolveLocalizedUser(user);
  return enqueueSendEmail(
    {
      type: "verification",
      to: localizedUser.email,
      data: {
        name: localizedUser.name,
        verificationUrl: `${frontendUrl()}/verify-email?token=${encodeURIComponent(token)}`,
        locale: localeFromUser(localizedUser),
      },
    },
    options,
  );
}

export async function enqueueWelcomeEmail(
  user: LocalizedUser,
  options: EmailJobOptions = {},
) {
  const localizedUser = await resolveLocalizedUser(user);
  return enqueueSendEmail(
    {
      type: "welcome",
      to: localizedUser.email,
      data: {
        name: localizedUser.name,
        dashboardUrl: `${frontendUrl()}/operations`,
        locale: localeFromUser(localizedUser),
      },
    },
    options,
  );
}

export async function enqueuePasswordResetEmail(
  user: LocalizedUser,
  resetToken: string,
  options: EmailJobOptions = {},
) {
  const localizedUser = await resolveLocalizedUser(user);
  return enqueueSendEmail(
    {
      type: "password_reset",
      to: localizedUser.email,
      data: {
        name: localizedUser.name,
        resetUrl: `${frontendUrl()}/reset-password?token=${encodeURIComponent(resetToken)}`,
        locale: localeFromUser(localizedUser),
      },
    },
    options,
  );
}

export async function enqueueStaffInviteEmail(
  to: string,
  payload: {
    inviterName?: string;
    businessName: string;
    acceptUrl: string;
    locale?: string | null;
    idempotencyKey?: string;
  },
  options: EmailJobOptions = {},
) {
  return enqueueSendEmail(
    {
      type: "staff_invite",
      to,
      data: {
        inviterName: payload.inviterName,
        businessName: payload.businessName,
        acceptUrl: payload.acceptUrl,
        locale: normalizeEmailLocale(payload.locale),
      },
      idempotencyKey: payload.idempotencyKey,
    },
    options,
  );
}

export default {
  enqueueVerificationEmail,
  enqueueWelcomeEmail,
  enqueuePasswordResetEmail,
  enqueueStaffInviteEmail,
};
