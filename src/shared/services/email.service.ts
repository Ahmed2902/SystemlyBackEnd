import { enqueueSendEmail } from "../../queues/emailQueue";

export const makeVerificationPayload = (
  user: { name: string; email: string },
  token: string,
) => {
  const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${token}`;
  return {
    type: "verification",
    to: user.email,
    data: { name: user.name, verificationUrl },
    tenantId: undefined,
  };
};

export const makeWelcomePayload = (user: { name: string; email: string }) => {
  const dashboardUrl = `${process.env.FRONTEND_URL}/dashboard`;
  const websiteUrl = process.env.FRONTEND_URL || process.env.APP_URL || "";
  return {
    type: "welcome",
    to: user.email,
    data: { name: user.name, dashboardUrl, websiteUrl },
  };
};

export const makePasswordResetPayload = (
  user: { name: string; email: string },
  resetToken: string,
) => {
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
  return {
    type: "password_reset",
    to: user.email,
    data: { name: user.name, resetUrl },
  };
};

export const makeAppointmentPayload = (
  to: string,
  payload: Record<string, any>,
  subtype: "confirmation" | "reminder",
) => {
  return {
    type: "appointment",
    to,
    data: { ...payload, subtype },
    tenantId: payload.businessId || payload.tenantId,
    idempotencyKey: payload.idempotencyKey,
  };
};

export const makeStaffInvitePayload = (
  to: string,
  payload: Record<string, any>,
) => ({
  type: "subscription",
  to,
  data: { ...payload, subtype: "staff_invite" },
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
  data: { ...payload, subtype },
  tenantId: payload.businessId || payload.tenantId,
  idempotencyKey: payload.idempotencyKey,
});

export const enqueueVerificationEmail = async (
  user: { name: string; email: string },
  token: string,
  opts: any = {},
) => {
  return enqueueSendEmail(makeVerificationPayload(user, token), opts);
};

export const enqueueWelcomeEmail = async (
  user: { name: string; email: string },
  opts: any = {},
) => enqueueSendEmail(makeWelcomePayload(user), opts);

export const enqueuePasswordResetEmail = async (
  user: { name: string; email: string },
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
  user: { name: string; email: string },
  payload: Record<string, any>,
  opts: any = {},
) =>
  enqueueSendEmail(
    makeSubscriptionPayload(user.email, payload, "trial_started"),
    opts,
  );

export const enqueueTrialEndingEmail = async (
  user: { name: string; email: string },
  payload: Record<string, any>,
  opts: any = {},
) =>
  enqueueSendEmail(
    makeSubscriptionPayload(user.email, payload, "trial_ending"),
    opts,
  );

export const enqueueTrialExpiredEmail = async (
  user: { name: string; email: string },
  payload: Record<string, any>,
  opts: any = {},
) =>
  enqueueSendEmail(
    makeSubscriptionPayload(user.email, payload, "trial_expired"),
    opts,
  );

export const enqueueSubscriptionActivatedEmail = async (
  user: { name: string; email: string },
  payload: Record<string, any>,
  opts: any = {},
) =>
  enqueueSendEmail(
    makeSubscriptionPayload(user.email, payload, "subscription_activated"),
    opts,
  );

export const enqueueSubscriptionPaymentFailedEmail = async (
  user: { name: string; email: string },
  payload: Record<string, any>,
  opts: any = {},
) =>
  enqueueSendEmail(
    makeSubscriptionPayload(user.email, payload, "subscription_payment_failed"),
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
