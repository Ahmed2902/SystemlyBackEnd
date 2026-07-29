import bookingsService from "../src/modules/bookings/bookings.service";
import { prisma } from "../src/shared/db/prisma";

const makeTx = (conflict = false) => ({
  service: {
    findMany: async () => [
      {
        id: "svc1",
        businessId: "b1",
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
        ? [{ staffId: "st1", startsAt: new Date("2026-04-20T09:15:00Z"), endsAt: new Date("2026-04-20T10:00:00Z") }]
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

describe("booking integration (mocked prisma)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.business.findUnique as any) = jest
      .fn()
      .mockResolvedValue({ id: "b1", timezone: "UTC" });
  });

  test("createBooking success", async () => {
    (prisma.$transaction as any) = jest
      .fn()
      .mockImplementation(async (fn: any) => fn(makeTx()));

    const res = await bookingsService.createBooking({
      businessId: "b1",
      services: [{ serviceId: "svc1" }],
      startsAt: "2026-04-20T09:00:00Z",
      customerName: "Alice",
      customerPhone: "+2012345",
    });

    expect(res).toHaveProperty("appointment");
    expect(res).toHaveProperty("customer");
  });

  test("createBooking conflict", async () => {
    (prisma.$transaction as any) = jest
      .fn()
      .mockImplementation(async (fn: any) => fn(makeTx(true)));

    await expect(
      bookingsService.createBooking({
        businessId: "b1",
        services: [{ serviceId: "svc1" }],
        startsAt: "2026-04-20T09:00:00Z",
        customerName: "Bob",
        customerPhone: "+2012345",
      }),
    ).rejects.toMatchObject({ code: "SLOT_TAKEN" });
  });
});
