import { Roles, SubscriptionStatus } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";
import {
  deriveSubscriptionAccess,
  SUBSCRIPTION_ACCESS_MODES,
  type SubscriptionAccessSnapshot,
} from "../src/modules/subscriptions/subscription-access.service";
import { ENTITLEMENTS } from "../src/modules/subscriptions/subscription.catalog";
import {
  requireEntitlement,
  requireSubscriptionAccess,
} from "../src/shared/middleware/subscription-access.middleware";

const NOW = new Date("2026-08-10T12:00:00.000Z");

function subscription(
  status: SubscriptionStatus,
  overrides: Partial<{
    trialEndsAt: Date | null;
    currentPeriodEnd: Date | null;
    graceEndsAt: Date | null;
  }> = {},
) {
  return {
    status,
    trialEndsAt: null,
    currentPeriodEnd: null,
    graceEndsAt: null,
    cancelAtPeriodEnd: false,
    plan: {
      code: "CORE",
      entitlements: [{ key: ENTITLEMENTS.CUSTOMER_CRM }],
    },
    ...overrides,
  };
}

function requestWithAccess(
  method: string,
  access: SubscriptionAccessSnapshot,
) {
  return {
    method,
    user: {
      id: "user-1",
      businessId: access.businessId,
      role: Roles.BusinessAdmin,
    },
    subscriptionAccess: access,
  } as Request;
}

function responseDouble() {
  const response = {
    status: jest.fn(),
    json: jest.fn(),
  };
  response.status.mockReturnValue(response);
  return response as unknown as Response;
}

describe("subscription access decisions", () => {
  test.each([
    [
      "owner with a valid trial",
      Roles.BusinessAdmin,
      subscription(SubscriptionStatus.TRIALING, {
        trialEndsAt: new Date("2026-08-16T12:00:00.000Z"),
      }),
      SUBSCRIPTION_ACCESS_MODES.FULL,
    ],
    [
      "staff with an active subscription",
      Roles.Staff,
      subscription(SubscriptionStatus.ACTIVE, {
        currentPeriodEnd: new Date("2026-09-10T12:00:00.000Z"),
      }),
      SUBSCRIPTION_ACCESS_MODES.FULL,
    ],
    [
      "receptionist during grace",
      Roles.Receptionist,
      subscription(SubscriptionStatus.PAST_DUE, {
        graceEndsAt: new Date("2026-08-12T12:00:00.000Z"),
      }),
      SUBSCRIPTION_ACCESS_MODES.FULL,
    ],
    [
      "owner after expiry",
      Roles.BusinessAdmin,
      subscription(SubscriptionStatus.EXPIRED),
      SUBSCRIPTION_ACCESS_MODES.OWNER_READ_ONLY,
    ],
    [
      "staff after expiry",
      Roles.Staff,
      subscription(SubscriptionStatus.EXPIRED),
      SUBSCRIPTION_ACCESS_MODES.BLOCKED,
    ],
    [
      "owner without a subscription",
      Roles.BusinessAdmin,
      null,
      SUBSCRIPTION_ACCESS_MODES.OWNER_READ_ONLY,
    ],
    [
      "staff without a subscription",
      Roles.Staff,
      null,
      SUBSCRIPTION_ACCESS_MODES.BLOCKED,
    ],
  ])("resolves %s", (_label, role, currentSubscription, expectedMode) => {
    const access = deriveSubscriptionAccess(
      {
        businessId: "business-1",
        role,
        subscription: currentSubscription,
      },
      NOW,
    );

    expect(access.mode).toBe(expectedMode);
  });

  test("blocks a soft-deleted business", () => {
    expect(
      deriveSubscriptionAccess(
        {
          businessId: "business-1",
          role: Roles.BusinessAdmin,
          deletedAt: NOW,
          subscription: subscription(SubscriptionStatus.ACTIVE, {
            currentPeriodEnd: new Date("2026-09-10T12:00:00.000Z"),
          }),
        },
        NOW,
      ).mode,
    ).toBe(SUBSCRIPTION_ACCESS_MODES.BLOCKED);
  });

  test("keeps platform super administrators operational", () => {
    expect(
      deriveSubscriptionAccess(
        {
          businessId: "business-1",
          role: Roles.SuperAdmin,
          deletedAt: NOW,
          subscription: null,
        },
        NOW,
      ).mode,
    ).toBe(SUBSCRIPTION_ACCESS_MODES.FULL);
  });
});

describe("subscription access middleware", () => {
  const expiredOwner = deriveSubscriptionAccess(
    {
      businessId: "business-1",
      role: Roles.BusinessAdmin,
      subscription: subscription(SubscriptionStatus.EXPIRED),
    },
    NOW,
  );

  test("allows an expired owner to read existing data", async () => {
    const next = jest.fn() as NextFunction;
    const response = responseDouble();

    await requireSubscriptionAccess(
      requestWithAccess("GET", expiredOwner),
      response,
      next,
    );

    expect(next).toHaveBeenCalledTimes(1);
    expect(response.status).not.toHaveBeenCalled();
  });

  test("blocks an expired owner from mutating data", async () => {
    const next = jest.fn() as NextFunction;
    const response = responseDouble();

    await requireSubscriptionAccess(
      requestWithAccess("PATCH", expiredOwner),
      response,
      next,
    );

    expect(next).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(402);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "SUBSCRIPTION_READ_ONLY" }),
    );
  });

  test("blocks staff from reads after expiry", async () => {
    const blockedStaff = deriveSubscriptionAccess(
      {
        businessId: "business-1",
        role: Roles.Staff,
        subscription: subscription(SubscriptionStatus.EXPIRED),
      },
      NOW,
    );
    const next = jest.fn() as NextFunction;
    const response = responseDouble();

    await requireSubscriptionAccess(
      requestWithAccess("GET", blockedStaff),
      response,
      next,
    );

    expect(next).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(402);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "SUBSCRIPTION_INACTIVE" }),
    );
  });

  test("checks optional plan entitlements without another database read", async () => {
    const fullAccess = deriveSubscriptionAccess(
      {
        businessId: "business-1",
        role: Roles.BusinessAdmin,
        subscription: subscription(SubscriptionStatus.ACTIVE, {
          currentPeriodEnd: new Date("2026-09-10T12:00:00.000Z"),
        }),
      },
      NOW,
    );
    const next = jest.fn() as NextFunction;
    const response = responseDouble();

    await requireEntitlement(ENTITLEMENTS.WHATSAPP_AI)(
      requestWithAccess("POST", fullAccess),
      response,
      next,
    );

    expect(next).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(403);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "PLAN_FEATURE_REQUIRED" }),
    );
  });
});
