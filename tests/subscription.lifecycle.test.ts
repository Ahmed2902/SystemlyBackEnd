import { SubscriptionStatus } from "@prisma/client";
import {
  addCalendarMonth,
  addExactDays,
  effectiveSubscriptionStatus,
  TRIAL_DURATION_DAYS,
} from "../src/modules/subscriptions/subscription.service";

describe("subscription lifecycle dates", () => {
  test("a trial lasts exactly 14 days from onboarding completion", () => {
    const startedAt = new Date("2026-08-02T13:37:42.000Z");
    const endsAt = addExactDays(startedAt, TRIAL_DURATION_DAYS);

    expect(endsAt.toISOString()).toBe("2026-08-16T13:37:42.000Z");
    expect(endsAt.getTime() - startedAt.getTime()).toBe(
      14 * 24 * 60 * 60 * 1000,
    );
  });

  test.each([
    ["2026-01-31T09:15:00.000Z", "2026-02-28T09:15:00.000Z"],
    ["2028-01-31T09:15:00.000Z", "2028-02-29T09:15:00.000Z"],
    ["2026-08-15T16:45:00.000Z", "2026-09-15T16:45:00.000Z"],
  ])("adds one calendar month from %s", (start, expected) => {
    expect(addCalendarMonth(new Date(start)).toISOString()).toBe(expected);
  });

  test("expires a trial at request time even before the hourly job runs", () => {
    const now = new Date("2026-08-16T13:37:42.000Z");

    expect(
      effectiveSubscriptionStatus(
        {
          status: SubscriptionStatus.TRIALING,
          trialEndsAt: now,
          currentPeriodEnd: null,
          graceEndsAt: null,
        },
        now,
      ),
    ).toBe(SubscriptionStatus.EXPIRED);
  });

  test("requires every active subscription to have a future paid period", () => {
    const now = new Date("2026-08-20T10:00:00.000Z");

    expect(
      effectiveSubscriptionStatus(
        {
          status: SubscriptionStatus.ACTIVE,
          trialEndsAt: null,
          currentPeriodEnd: null,
          graceEndsAt: null,
        },
        now,
      ),
    ).toBe(SubscriptionStatus.EXPIRED);

    expect(
      effectiveSubscriptionStatus(
        {
          status: SubscriptionStatus.ACTIVE,
          trialEndsAt: null,
          currentPeriodEnd: new Date("2026-09-20T10:00:00.000Z"),
          graceEndsAt: null,
        },
        now,
      ),
    ).toBe(SubscriptionStatus.ACTIVE);
  });

  test("keeps a past-due subscription usable until grace expires", () => {
    const now = new Date("2026-08-20T10:00:00.000Z");

    expect(
      effectiveSubscriptionStatus(
        {
          status: SubscriptionStatus.PAST_DUE,
          trialEndsAt: null,
          currentPeriodEnd: new Date("2026-08-19T10:00:00.000Z"),
          graceEndsAt: new Date("2026-08-22T10:00:00.000Z"),
        },
        now,
      ),
    ).toBe(SubscriptionStatus.PAST_DUE);
  });
});
