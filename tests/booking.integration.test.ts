import { SubscriptionStatus } from "@prisma/client";
import bookingsService from "../src/modules/bookings/bookings.service";
import { ENTITLEMENTS } from "../src/modules/subscriptions/subscription.catalog";
import { prisma } from "../src/shared/db/prisma";

const makeTx = (conflict = false) => ({
  $executeRaw: async () => 1,
  branch: {
    findFirst: async () => ({ timezone: "Africa/Cairo" }),
  },
  service: {
    findMany: async () => [
      {
        id: "svc1",
        businessId: "b1",
        branchId: "branch1",
        isActive: true,
        durationMin: 45,
        priceEgp: 100,
      },
    ],
  },
  serviceStaff: {
    findMany: async () => [
      {
        serviceId: "svc1",
        staffId: "st1",
        staff: { isActive: true },
      },
    ],
    findUnique: async () => null,
  },
  availabilityOverride: { findMany: async () => [] },
  availability: {
    findMany: async () => [
      {
        staffId: "st1",
        startTime: new Date("1970-01-01T09:00:00Z"),
        endTime: new Date("1970-01-01T17:00:00Z"),
      },
    ],
  },
  appointmentService: {
    findMany: async () =>
      conflict
        ? [
            {
              staffId: "st1",
              // 09:00-09:45 Africa/Cairo on 2026-04-20 is 07:00-07:45 UTC.
              startsAt: new Date("2026-04-20T07:00:00Z"),
              endsAt: new Date("2026-04-20T07:45:00Z"),
            },
          ]
        : [],
    createMany: async () => ({ count: 1 }),
  },
  staffBreak: { findMany: async () => [] },
  staffTimeOff: { findMany: async () => [] },
  customer: {
    findUnique: async () => null,
    create: async () => ({ id: "c1" }),
    update: async () => ({ id: "c1" }),
  },
  appointment: {
    create: async () => ({ id: "a1" }),
  },
});

const activeBusiness = {
  id: "b1",
  slug: "test-business",
  timezone: "UTC",
  isActive: true,
  deletedAt: null,
  subscription: {
    status: SubscriptionStatus.TRIALING,
    trialEndsAt: new Date("2099-01-01T00:00:00.000Z"),
    currentPeriodEnd: null,
    graceEndsAt: null,
    plan: {
      entitlements: [{ key: ENTITLEMENTS.ONLINE_BOOKING }],
    },
  },
};

const activeBranch = {
  id: "branch1",
  businessId: "b1",
  name: "Main Branch",
  slug: "main-branch",
  phone: null,
  address: null,
  city: null,
  lat: null,
  lng: null,
  timezone: "Africa/Cairo",
  isActive: true,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

describe("booking integration (mocked prisma)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.business.findUnique as any) = jest
      .fn()
      .mockResolvedValue(activeBusiness);
    (prisma.branch.findMany as any) = jest.fn().mockResolvedValue([activeBranch]);
  });

  test("createBooking success", async () => {
    (prisma.$transaction as any) = jest
      .fn()
      .mockImplementation(async (fn: any) => fn(makeTx()));

    const result = await bookingsService.createBooking({
      businessId: "b1",
      services: [{ serviceId: "svc1" }],
      startsAt: "2026-04-20T09:00:00",
      customerName: "Alice",
      customerPhone: "+2012345",
    });

    expect(result).toHaveProperty("appointment");
    expect(result).toHaveProperty("customer");
  });

  test("createBooking conflict", async () => {
    (prisma.$transaction as any) = jest
      .fn()
      .mockImplementation(async (fn: any) => fn(makeTx(true)));

    await expect(
      bookingsService.createBooking({
        businessId: "b1",
        services: [{ serviceId: "svc1" }],
        startsAt: "2026-04-20T09:00:00",
        customerName: "Bob",
        customerPhone: "+2012345",
      }),
    ).rejects.toMatchObject({ code: "SLOT_TAKEN" });
  });
});
