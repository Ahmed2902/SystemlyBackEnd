import { AppointmentStatus } from "@prisma/client";

describe("branch deactivation safety", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it("rejects deactivation while active or upcoming appointments remain", async () => {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      branch: {
        findFirst: jest.fn().mockResolvedValue({
          id: "branch-1",
          businessId: "business-1",
          isActive: true,
        }),
        count: jest.fn().mockResolvedValue(2),
        update: jest.fn(),
      },
      appointment: {
        findFirst: jest.fn().mockResolvedValue({ id: "appointment-1" }),
      },
    };

    jest.doMock("../src/shared/db/prisma", () => ({
      prisma: {
        $transaction: (callback: (client: typeof tx) => unknown) => callback(tx),
      },
    }));

    const service = require("../src/modules/branches/branches.service").default;

    await expect(service.deactivate("business-1", "branch-1")).rejects.toMatchObject({
      code: "BRANCH_HAS_ACTIVE_APPOINTMENTS",
      statusCode: 409,
    });
    expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
    expect(tx.appointment.findFirst).toHaveBeenCalledWith({
      where: {
        businessId: "business-1",
        branchId: "branch-1",
        status: {
          in: [
            AppointmentStatus.pending,
            AppointmentStatus.confirmed,
            AppointmentStatus.in_progress,
          ],
        },
        endsAt: { gt: expect.any(Date) },
      },
      select: { id: true },
    });
    expect(tx.branch.update).not.toHaveBeenCalled();
  });

  it("deactivates when another branch remains and no active appointments remain", async () => {
    const updated = {
      id: "branch-1",
      businessId: "business-1",
      isActive: false,
    };
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      branch: {
        findFirst: jest.fn().mockResolvedValue({
          ...updated,
          isActive: true,
        }),
        count: jest.fn().mockResolvedValue(2),
        update: jest.fn().mockResolvedValue(updated),
      },
      appointment: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };

    jest.doMock("../src/shared/db/prisma", () => ({
      prisma: {
        $transaction: (callback: (client: typeof tx) => unknown) => callback(tx),
      },
    }));

    const service = require("../src/modules/branches/branches.service").default;

    await expect(service.deactivate("business-1", "branch-1")).resolves.toEqual(updated);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
    expect(tx.branch.update).toHaveBeenCalledWith({
      where: { id: "branch-1" },
      data: { isActive: false },
    });
  });
});
