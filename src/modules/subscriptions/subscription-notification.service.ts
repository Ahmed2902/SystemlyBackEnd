import { enqueueSendEmail } from "../../queues/emailQueue";
import { makeSubscriptionPayload } from "../../shared/services/email.service";

export type SubscriptionNoticeSubtype =
  | "trial_ending"
  | "trial_expired"
  | "subscription_renewal_ending"
  | "subscription_payment_failed"
  | "subscription_expired"
  | "subscription_canceled";

export interface SubscriptionNoticeInput {
  idempotencyKey: string;
  subtype: SubscriptionNoticeSubtype;
  owner: {
    name: string;
    email: string;
    preferredLanguage?: string | null;
  };
  businessId: string;
  businessName: string;
  planName: string;
  trialEnd?: string;
  daysLeft?: number;
  expiredAt?: string;
  periodEnd?: string;
  graceEnd?: string;
}

export interface SubscriptionNotifier {
  send(input: SubscriptionNoticeInput): Promise<void>;
}

export class EmailSubscriptionNotifier implements SubscriptionNotifier {
  async send(input: SubscriptionNoticeInput) {
    const payload = makeSubscriptionPayload(
      input.owner.email,
      {
        name: input.owner.name,
        businessId: input.businessId,
        businessName: input.businessName,
        planName: input.planName,
        trialEnd: input.trialEnd,
        daysLeft: input.daysLeft,
        expiredAt: input.expiredAt,
        periodEnd: input.periodEnd,
        graceEnd: input.graceEnd,
        preferredLanguage: input.owner.preferredLanguage,
        idempotencyKey: input.idempotencyKey,
      },
      input.subtype,
    );

    await enqueueSendEmail(payload, {
      idempotencyKey: input.idempotencyKey,
    });
  }
}

export const subscriptionNotifier = new EmailSubscriptionNotifier();
