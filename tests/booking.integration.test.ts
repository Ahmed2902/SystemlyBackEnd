import { createBooking } from "../src/modules/bookings/bookings.service";
import { prisma } from "../src/shared/db/prisma";

describe("booking integration (mocked prisma)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("createBooking success", async () => {
    // arrange: mock top-level prisma calls
    (prisma.service.findUnique as any) = jest
      .fn()
      .mockResolvedValue({ id: "svc1", durationMin: 45 });
    (prisma.serviceStaff.findMany as any) = jest
      .fn()
      .mockResolvedValue([{ staffId: "st1", staff: { isActive: true } }]);
    (prisma.business.findUnique as any) = jest
      .fn()
      .mockResolvedValue({ timezone: "UTC" });
    (prisma.appointment.count as any) = jest.fn().mockResolvedValue(0);
    (prisma.customer.findUnique as any) = jest.fn().mockResolvedValue(null);
    (prisma.customer.create as any) = jest.fn().mockResolvedValue({ id: "c1" });
    (prisma.customer.update as any) = jest.fn().mockResolvedValue({ id: "c1" });

    // mock transaction behavior
    (prisma.$transaction as any) = jest
      .fn()
      .mockImplementation(async (fn: any) => {
        const tx = {
          service: { findUnique: async () => ({ durationMin: 45 }) },
          appointment: {
            findFirst: async () => null,
            create: async () => ({ id: "a1" }),
          },
          customer: {
            findUnique: async () => null,
            create: async () => ({ id: "c1" }),
          },
        };
        return fn(tx);
      });

    const payload = {
      businessId: "b1",
      serviceId: "svc1",
      startsAt: "2026-04-20T09:00:00Z",
      customerName: "Alice",
      customerPhone: "+2012345",
    };

    const res = await createBooking(payload as any);
    expect(res).toHaveProperty("appointment");
    expect(res).toHaveProperty("customer");
  });

  test("createBooking conflict", async () => {
    (prisma.service.findUnique as any) = jest
      .fn()
      .mockResolvedValue({ id: "svc1", durationMin: 45 });
    (prisma.serviceStaff.findMany as any) = jest
      .fn()
      .mockResolvedValue([{ staffId: "st1", staff: { isActive: true } }]);
    (prisma.business.findUnique as any) = jest
      .fn()
      .mockResolvedValue({ timezone: "UTC" });
    (prisma.appointment.count as any) = jest.fn().mockResolvedValue(0);
    (prisma.customer.findUnique as any) = jest.fn().mockResolvedValue(null);
    (prisma.customer.create as any) = jest.fn().mockResolvedValue({ id: "c1" });
    (prisma.customer.update as any) = jest.fn().mockResolvedValue({ id: "c1" });
    (prisma.$transaction as any) = jest
      .fn()
      .mockImplementation(async (fn: any) => {
        const tx = {
          service: { findUnique: async () => ({ durationMin: 45 }) },
          appointment: { findFirst: async () => ({ id: "conflict" }) },
          customer: { findUnique: async () => null },
        };
        return fn(tx);
      });

    const payload = {
      businessId: "b1",
      serviceId: "svc1",
      startsAt: "2026-04-20T09:00:00Z",
      customerName: "Bob",
      customerPhone: "+2012345",
    };

    await expect(createBooking(payload as any)).rejects.toMatchObject({
      code: "SLOT_TAKEN",
    });
  });
});
