import { setupBranchSchema } from "../src/modules/branches/branches.schema";

const validSetup = {
  name: "Maadi",
  slug: "maadi",
  phone: "01000000000",
  city: "Cairo",
  address: "Maadi",
  timezone: "Africa/Cairo" as const,
  services: [
    {
      clientId: "service-client-1",
      name: "Haircut",
      durationMin: 30,
      priceEgp: 250,
    },
  ],
  staff: [
    {
      clientId: "staff-client-1",
      name: "Ahmed",
      jobTitle: "Barber",
      serviceClientIds: ["service-client-1"],
      availability: [
        { dayOfWeek: 0, startTime: "09:00", endTime: "18:00" },
      ],
    },
  ],
};

describe("atomic branch setup", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it("validates service rules before any write", () => {
    const invalid = setupBranchSchema.safeParse({
      ...validSetup,
      services: [{ ...validSetup.services[0], durationMin: 1 }],
    });
    expect(invalid.success).toBe(false);
  });

  it("creates branch, services, staff, assignments and availability in one transaction", async () => {
    const branch = {
      id: "branch-1",
      businessId: "business-1",
      name: "Maadi",
      slug: "maadi",
      isActive: true,
    };
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      business: {
        findUnique: jest.fn().mockResolvedValue({
          id: "business-1",
          name: "Systemly Test",
          language: "en",
        }),
      },
      businessUser: { findUnique: jest.fn() },
      branch: { create: jest.fn().mockResolvedValue(branch) },
      service: {
        create: jest.fn().mockResolvedValue({ id: "service-1" }),
      },
      staff: {
        create: jest.fn().mockResolvedValue({ id: "staff-1" }),
      },
      serviceStaff: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
      availability: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
      staffInvite: {
        updateMany: jest.fn(),
        create: jest.fn(),
      },
    };
    const transaction = jest.fn(
      async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    );

    jest.doMock("../src/shared/db/prisma", () => ({
      prisma: { $transaction: transaction },
    }));
    jest.doMock("../src/shared/services/email.service", () => ({
      enqueueStaffInviteEmail: jest.fn(),
    }));

    const service = require("../src/modules/branches/branches.service").default;
    await expect(service.setup("business-1", validSetup)).resolves.toEqual({
      branch,
      invitation: null,
    });

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(tx.branch.create).toHaveBeenCalledTimes(1);
    expect(tx.service.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        businessId: "business-1",
        branchId: "branch-1",
        name: "Haircut",
      }),
    });
    expect(tx.staff.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        businessId: "business-1",
        branchId: "branch-1",
        name: "Ahmed",
      }),
    });
    expect(tx.serviceStaff.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          serviceId: "service-1",
          staffId: "staff-1",
        }),
      ],
    });
    expect(tx.availability.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          staffId: "staff-1",
          dayOfWeek: 0,
        }),
      ],
    });
  });

  it("does not queue external invitation work when the transaction fails", async () => {
    const enqueueStaffInviteEmail = jest.fn();
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      business: {
        findUnique: jest.fn().mockResolvedValue({
          id: "business-1",
          name: "Systemly Test",
          language: "en",
        }),
      },
      businessUser: { findUnique: jest.fn() },
      branch: {
        create: jest.fn().mockResolvedValue({ id: "branch-1" }),
      },
      service: {
        create: jest.fn().mockResolvedValue({ id: "service-1" }),
      },
      staff: {
        create: jest.fn().mockRejectedValue(new Error("staff write failed")),
      },
      serviceStaff: { createMany: jest.fn() },
      availability: { createMany: jest.fn() },
      staffInvite: { updateMany: jest.fn(), create: jest.fn() },
    };

    jest.doMock("../src/shared/db/prisma", () => ({
      prisma: {
        $transaction: (callback: (client: typeof tx) => Promise<unknown>) =>
          callback(tx),
      },
    }));
    jest.doMock("../src/shared/services/email.service", () => ({
      enqueueStaffInviteEmail,
    }));

    const service = require("../src/modules/branches/branches.service").default;
    await expect(service.setup("business-1", validSetup)).rejects.toThrow(
      "staff write failed",
    );
    expect(enqueueStaffInviteEmail).not.toHaveBeenCalled();
  });
});
