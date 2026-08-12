import { AppointmentStatus } from "@prisma/client";

const appointmentId = "appointment-1";
const businessId = "business-1";
const branchId = "branch-1";

function buildTx() {
  const appointment = {
    id: appointmentId,
    businessId,
    branchId,
    status: AppointmentStatus.confirmed,
    startsAt: new Date("2026-08-10T08:00:00.000Z"),
    endsAt: new Date("2026-08-10T08:30:00.000Z"),
    branch: { timezone: "Africa/Cairo" },
    business: { timezone: "Africa/Cairo" },
    invoices: [],
    appointmentServices: [
      {
        id: "segment-1",
        serviceId: "service-1",
        staffId: "staff-1",
        durationMinSnapshot: 30,
      },
    ],
  };

  return {
    $executeRaw: jest.fn().mockResolvedValue(1),
    branch: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    appointment: {
      findFirst: jest.fn().mockResolvedValue(appointment),
      update: jest.fn(),
    },
  };
}

describe("appointment branch lifecycle safety", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it("rejects rescheduling after the branch becomes inactive inside the mutation transaction", async () => {
    const tx = buildTx();
    jest.doMock("../src/shared/db/prisma", () => ({
      prisma: {
        $transaction: (callback: (client: typeof tx) => unknown) => callback(tx),
      },
    }));

    const service = require("../src/modules/appointments/appointments.command.service")
      .default;

    await expect(
      service.rescheduleAppointment(
        appointmentId,
        businessId,
        "2026-08-13T10:00:00",
      ),
    ).rejects.toMatchObject({
      code: "BRANCH_NOT_FOUND",
      statusCode: 404,
    });

    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tx.branch.findFirst).toHaveBeenCalledWith({
      where: { id: branchId, businessId, isActive: true },
      select: { timezone: true },
    });
    expect(tx.appointment.update).not.toHaveBeenCalled();
  });

  it("rejects editing appointment segments after the branch becomes inactive", async () => {
    const tx = buildTx();
    jest.doMock("../src/shared/db/prisma", () => ({
      prisma: {
        $transaction: (callback: (client: typeof tx) => unknown) => callback(tx),
      },
    }));

    const service = require("../src/modules/appointments/appointments.command.service")
      .default;

    await expect(
      service.updateAppointment(appointmentId, businessId, {
        segments: [
          {
            serviceId: "00000000-0000-0000-0000-000000000001",
            staffId: "00000000-0000-0000-0000-000000000002",
            startsAt: "2026-08-13T08:00:00.000Z",
            endsAt: "2026-08-13T08:30:00.000Z",
          },
        ],
        customItems: [],
        discountCents: 0,
      }),
    ).rejects.toMatchObject({
      code: "BRANCH_NOT_FOUND",
      statusCode: 404,
    });

    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tx.branch.findFirst).toHaveBeenCalledWith({
      where: { id: branchId, businessId, isActive: true },
      select: { timezone: true },
    });
    expect(tx.appointment.update).not.toHaveBeenCalled();
  });
});
