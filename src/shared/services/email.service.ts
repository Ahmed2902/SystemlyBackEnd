import { enqueueSendEmail } from "../../queues/emailQueue";
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

export const makeVerificationPayload = (
  user: LocalizedUser,
  token: string,
) => {
  const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${token}`;
  return {
    type: "verification",
    to: user.email,
    data: {
      name: user.name,
      verificationUrl,
      locale: localeFromUser(user),
    },
    tenantId: undefined,
  };
};

export const makeWelcomePayload = (user: LocalizedUser) => {
  const dashboardUrl = `${process.env.FRONTEND_URL}/operations`;
  const websiteUrl = process.env.FRONTEND_URL || process.env.APP_URL || "";
  return {
    type: "welcome",
    to: user.email,
    data: {
      name: user.name,
      dashboardUrl,
      websiteUrl,
      locale: localeFromUser(user),
    },
  };
};

export const makePasswordResetPayload = (
  user: LocalizedUser,
  resetToken: string,
) => {
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
  return {
    type: "password_reset",
    to: user.email,
    data: {
      name: user.name,
      resetUrl,
      locale: localeFromUser(user),
    },
  };
};

export const makeAppointmentPayload = (
  to: string,
  payload: Record<string, any>,
  subtype: "confirmation" | "reminder",
) => ({
  type: "appointment",
  to,
  data: {
    ...payload,
    subtype,
    locale: normalizeEmailLocale(payload.locale ?? payload.businessLanguage),
  },
  tenantId: payload.businessId || payload.tenantId,
  idempotencyKey: payload.idempotencyKey,
});

export const makeStaffInvitePayload = (
  to: string,
  payload: Record<string, any>,
) => ({
  type: "subscription",
  to,
  data: {
    ...payload,
    subtype: "staff_invite",
    locale: normalizeEmailLocale(
      payload.locale ?? payload.preferredLanguage ?? payload.businessLanguage,
    ),
  },
  tenantId: payload.businessId || payload.tenantId,
  idempotencyKey: payload.idempotencyKey,
});

export const makeSubscriptionPayload = (
  to: string,
  payload: Record<string, any>,
  subtype: string,
) => ({
  type: "subscription",
  to,
  data: {
    ...payload,
    subtype,
    locale: normalizeEmailLocale(
      payload.locale ?? payload.preferredLanguage,
    ),
  },
  tenantId: payload.businessId || payload.tenantId,
  idempotencyKey: payload.idempotencyKey,
});

export const enqueueVerificationEmail = async (
  user: LocalizedUser,
  token: string,
  opts: any = {},
) => enqueueSendEmail(makeVerificationPayload(user, token), opts);

export const enqueueWelcomeEmail = async (
  user: LocalizedUser,
  opts: any = {},
) => enqueueSendEmail(makeWelcomePayload(user), opts);

export const enqueuePasswordResetEmail = async (
  user: LocalizedUser,
  resetToken: string,
  opts: any = {},
) => enqueueSendEmail(makePasswordResetPayload(user, resetToken), opts);

export const enqueueAppointmentConfirmation = async (
  to: string,
  payload: Record<string, any>,
  opts: any = {},
) =>
  enqueueSendEmail(makeAppointmentPayload(to, payload, "confirmation"), opts);

export const enqueueAppointmentReminder = async (
  to: string,
  payload: Record<string, any>,
  opts: any = {},
) => enqueueSendEmail(makeAppointmentPayload(to, payload, "reminder"), opts);

export const enqueueStaffInviteEmail = async (
  to: string,
  payload: Record<string, any>,
  opts: any = {},
) => enqueueSendEmail(makeStaffInvitePayload(to, payload), opts);

export const enqueueTrialStartedEmail = async (
  user: LocalizedUser,
  payload: Record<string, any>,
  opts: any = {},
) =>
  enqueueSendEmail(
    makeSubscriptionPayload(
      user.email,
      { ...payload, preferredLanguage: user.preferredLanguage },
      "trial_started",
    ),
    opts,
  );

export const enqueueTrialEndingEmail = async (
  user: LocalizedUser,
  payload: Record<string, any>,
  opts: any = {},
) =>
  enqueueSendEmail(
    makeSubscriptionPayload(
      user.email,
      { ...payload, preferredLanguage: user.preferredLanguage },
      "trial_ending",
    ),
    opts,
  );

export const enqueueTrialExpiredEmail = async (
  user: LocalizedUser,
  payload: Record<string, any>,
  opts: any = {},
) =>
  enqueueSendEmail(
    makeSubscriptionPayload(
      user.email,
      { ...payload, preferredLanguage: user.preferredLanguage },
      "trial_expired",
    ),
    opts,
  );

export const enqueueSubscriptionActivatedEmail = async (
  user: LocalizedUser,
  payload: Record<string, any>,
  opts: any = {},
) =>
  enqueueSendEmail(
    makeSubscriptionPayload(
      user.email,
      { ...payload, preferredLanguage: user.preferredLanguage },
      "subscription_activated",
    ),
    opts,
  );

export const enqueueSubscriptionPaymentFailedEmail = async (
  user: LocalizedUser,
  payload: Record<string, any>,
  opts: any = {},
) =>
  enqueueSendEmail(
    makeSubscriptionPayload(
      user.email,
      { ...payload, preferredLanguage: user.preferredLanguage },
      "subscription_payment_failed",
    ),
    opts,
  );

export default {
  enqueueVerificationEmail,
  enqueueWelcomeEmail,
  enqueuePasswordResetEmail,
  enqueueAppointmentConfirmation,
  enqueueAppointmentReminder,
  enqueueStaffInviteEmail,
  enqueueTrialStartedEmail,
  enqueueTrialEndingEmail,
  enqueueTrialExpiredEmail,
  enqueueSubscriptionActivatedEmail,
  enqueueSubscriptionPaymentFailedEmail,
};
