import { SubscriptionStatus } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";
import businessService from "../src/modules/business/business.service";
import bookingsService from "../src/modules/bookings/bookings.service";
import {
  hasPublicFeature,
  PUBLIC_SITE_UNAVAILABLE_MESSAGE,
  publicSiteUnavailableError,
  requirePublicFeature,
  type PublicBusinessGate,
} from "../src/modules/subscriptions/public-subscription-access.service";
import {
  ENTITLEMENTS,
  PLAN_CODES,
} from "../src/modules/subscriptions/subscription.catalog";
import { ensureCorePlan } from "../src/modules/subscriptions/subscription.seed";
import { prisma } from "../src/shared/db/prisma";
import { errorHandler } from "../src/shared/middleware/errorHandler.middleware";

const NOW = new Date("2026-08-10T12:00:00.000Z");
const createdBusinessIds: string[] = [];

function gate(
  status: SubscriptionStatus,
  overrides: Partial<PublicBusinessGate> = {},
): PublicBusinessGate {
  return {
    id: "business-1",
    slug: "public-business",
    timezone: "Africa/Cairo",
    isActive: true,
    deletedAt: null,
    updatedAt: NOW,
    subscription: {
      status,
      trialEndsAt: null,
      currentPeriodEnd: null,
      graceEndsAt: null,
      plan: {
        entitlements: [
          { key: ENTITLEMENTS.PUBLIC_WEBSITE },
          { key: ENTITLEMENTS.ONLINE_BOOKING },
        ],
      },
    },
    ...overrides,
  };
}

function responseDouble() {
  const response = {
    status: jest.fn(),
    json: jest.fn(),
    setHeader: jest.fn(),
  };
  response.status.mockReturnValue(response);
  return response as unknown as Response;
}

async function createMainBranch(business: {
  id: string;
  phone: string;
  timezone: string;
}) {
  return prisma.branch.create({
    data: {
      businessId: business.id,
      name: "Main Branch",
      slug: "main",
      phone: business.phone,
      timezone: business.timezone,
      isActive: true,
    },
  });
}

afterEach(async () => {
  if (createdBusinessIds.length === 0) return;
  await prisma.business.deleteMany({
    where: { id: { in: createdBusinessIds.splice(0) } },
  });
});

describe("public subscription access decisions", () => {
  test("allows a valid trial, active period, and past-due grace period", () => {
    expect(
      hasPublicFeature(
        gate(SubscriptionStatus.TRIALING, {
          subscription: {
            ...gate(SubscriptionStatus.TRIALING).subscription!,
            trialEndsAt: new Date("2026-08-16T12:00:00.000Z"),
          },
        }),
        ENTITLEMENTS.PUBLIC_WEBSITE,
        NOW,
      ),
    ).toBe(true);

    expect(
      hasPublicFeature(
        gate(SubscriptionStatus.ACTIVE, {
          subscription: {
            ...gate(SubscriptionStatus.ACTIVE).subscription!,
            currentPeriodEnd: new Date("2026-09-10T12:00:00.000Z"),
          },
        }),
        ENTITLEMENTS.ONLINE_BOOKING,
        NOW,
      ),
    ).toBe(true);

    expect(
      hasPublicFeature(
        gate(SubscriptionStatus.PAST_DUE, {
          subscription: {
            ...gate(SubscriptionStatus.PAST_DUE).subscription!,
            graceEndsAt: new Date("2026-08-12T12:00:00.000Z"),
          },
        }),
        ENTITLEMENTS.PUBLIC_WEBSITE,
        NOW,
      ),
    ).toBe(true);
  });

  test.each([
    ["expired subscription", gate(SubscriptionStatus.EXPIRED)],
    [
      "expired grace period",
      gate(SubscriptionStatus.PAST_DUE, {
        subscription: {
          ...gate(SubscriptionStatus.PAST_DUE).subscription!,
          graceEndsAt: new Date("2026-08-10T12:00:00.000Z"),
        },
      }),
    ],
    ["missing subscription", { ...gate(SubscriptionStatus.ACTIVE), subscription: null }],
    ["unpublished business", { ...gate(SubscriptionStatus.ACTIVE), isActive: false }],
    ["soft-deleted business", { ...gate(SubscriptionStatus.ACTIVE), deletedAt: NOW }],
    [
      "missing entitlement",
      {
        ...gate(SubscriptionStatus.ACTIVE),
        subscription: {
          ...gate(SubscriptionStatus.ACTIVE).subscription!,
          currentPeriodEnd: new Date("2026-09-10T12:00:00.000Z"),
          plan: { entitlements: [] },
        },
      },
    ],
  ])("rejects an %s", (_label, business) => {
    expect(
      hasPublicFeature(
        business as PublicBusinessGate,
        ENTITLEMENTS.PUBLIC_WEBSITE,
        NOW,
      ),
    ).toBe(false);
  });

  test("returns one generic 503 error without business details", () => {
    const error = publicSiteUnavailableError() as Error & {
      statusCode?: number;
      code?: string;
    };

    expect(error.statusCode).toBe(503);
    expect(error.code).toBe("PUBLIC_SITE_UNAVAILABLE");
    expect(error.message).toBe(PUBLIC_SITE_UNAVAILABLE_MESSAGE);
    expect(error.message).not.toContain("public-business");
    expect(() =>
      requirePublicFeature(
        gate(SubscriptionStatus.EXPIRED),
        ENTITLEMENTS.PUBLIC_WEBSITE,
        NOW,
      ),
    ).toThrow(PUBLIC_SITE_UNAVAILABLE_MESSAGE);
  });

  test("marks the 503 response as non-cacheable", () => {
    const response = responseDouble();
    errorHandler(
      publicSiteUnavailableError(),
      {} as Request,
      response,
      jest.fn() as NextFunction,
    );

    expect(response.setHeader).toHaveBeenCalledWith("Cache-Control", "no-store");
    expect(response.setHeader).toHaveBeenCalledWith("Retry-After", "3600");
    expect(response.status).toHaveBeenCalledWith(503);
    expect(response.json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: "PUBLIC_SITE_UNAVAILABLE",
        message: PUBLIC_SITE_UNAVAILABLE_MESSAGE,
        requestId: null,
      },
    });
  });
});

describe("public website and booking integration", () => {
  test("serves only the explicit public business projection during a trial", async () => {
    const { plan } = await ensureCorePlan();
    expect(plan.code).toBe(PLAN_CODES.CORE);

    const business = await prisma.business.create({
      data: {
        name: "Public Trial Business",
        slug: `public-trial-${Date.now()}`,
        vertical: "salon",
        phone: "+201000000000",
        timezone: "Africa/Cairo",
        isActive: true,
        trialUsedAt: NOW,
      },
    });
    createdBusinessIds.push(business.id);
    await createMainBranch(business);

    await prisma.subscription.create({
      data: {
        businessId: business.id,
        planId: plan.id,
        status: SubscriptionStatus.TRIALING,
        trialStartedAt: NOW,
        trialEndsAt: new Date("2026-08-24T12:00:00.000Z"),
      },
    });

    const result = await businessService.getPublicBySlug(business.slug);

    expect(result).not.toBeNull();
    expect(result).toEqual(
      expect.objectContaining({ id: business.id, slug: business.slug }),
    );
    expect(result).not.toHaveProperty("trialUsedAt");
    expect(result).not.toHaveProperty("deletedAt");
    expect(result).not.toHaveProperty("subscription");
  });

  test("blocks website content, availability, and new bookings after expiry", async () => {
    const { plan } = await ensureCorePlan();
    const business = await prisma.business.create({
      data: {
        name: "Expired Public Business",
        slug: `expired-public-${Date.now()}`,
        vertical: "salon",
        phone: "+201000000001",
        timezone: "Africa/Cairo",
        isActive: true,
        trialUsedAt: new Date("2026-07-01T12:00:00.000Z"),
      },
    });
    createdBusinessIds.push(business.id);
    await createMainBranch(business);

    await prisma.subscription.create({
      data: {
        businessId: business.id,
        planId: plan.id,
        status: SubscriptionStatus.EXPIRED,
        trialStartedAt: new Date("2026-07-01T12:00:00.000Z"),
        trialEndsAt: new Date("2026-07-15T12:00:00.000Z"),
        endedAt: new Date("2026-07-15T12:00:00.000Z"),
      },
    });

    await expect(
      businessService.getPublicBySlug(business.slug),
    ).rejects.toMatchObject({
      statusCode: 503,
      code: "PUBLIC_SITE_UNAVAILABLE",
      message: PUBLIC_SITE_UNAVAILABLE_MESSAGE,
    });

    await expect(
      bookingsService.getAvailability({
        businessId: business.id,
        services: [{ serviceId: "service-1" }],
        date: "2026-08-20",
      }),
    ).rejects.toMatchObject({
      statusCode: 503,
      code: "PUBLIC_SITE_UNAVAILABLE",
    });

    await expect(
      bookingsService.createBooking({
        businessId: business.id,
        services: [{ serviceId: "service-1" }],
        startsAt: "2026-08-20T09:00:00.000Z",
        customerName: "Blocked Customer",
        customerPhone: "01000000000",
      }),
    ).rejects.toMatchObject({
      statusCode: 503,
      code: "PUBLIC_SITE_UNAVAILABLE",
    });
  });
});
