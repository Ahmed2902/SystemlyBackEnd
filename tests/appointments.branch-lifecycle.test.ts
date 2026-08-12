import { AppointmentStatus } from "@prisma/client";

const appointmentId = "appointment-1";
const businessId = "business-1";
const branchId = "branch-1";

function buildTx(status: AppointmentStatus = AppointmentStatus.confirmed) {
  const appointment = {
    id: appointmentId,
    businessId,
    branchId,
    customerId: "customer-1",
    customer: { noShowCount: 1, visitCount: 1 },
    status,
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
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
  };
}

function mockDatabase(tx: ReturnType<typeof buildTx>) {
  jest.doMock("../src/shared/db/prisma", () => ({
    prisma: {
      $transaction: (callback: (client: typeof tx) => unknown) => callback(tx),
    },
  }));
}

describe("appointment branch lifecycle safety", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it("rejects rescheduling after the branch becomes inactive inside the mutation transaction", async () => {
    const tx = buildTx();
    mockDatabase(tx);

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

  it("rejects rescheduling a completed appointment before acquiring the branch lock", async () => {
    const tx = buildTx(AppointmentStatus.completed);
    mockDatabase(tx);

    const service = require("../src/modules/appointments/appointments.command.service")
      .default;

    await expect(
      service.rescheduleAppointment(
        appointmentId,
        businessId,
        "2026-08-13T10:00:00",
      ),
    ).rejects.toMatchObject({
      code: "LOCKED",
    });

    expect(tx.$executeRaw).not.toHaveBeenCalled();
    expect(tx.appointment.update).not.toHaveBeenCalled();
  });

  it("rejects editing appointment segments after the branch becomes inactive", async () => {
    const tx = buildTx();
    mockDatabase(tx);

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

  it("rejects uncancelling into an inactive branch", async () => {
    const tx = buildTx(AppointmentStatus.cancelled_by_business);
    mockDatabase(tx);

    const service = require("../src/modules/appointments/appointments.command.service")
      .default;

    await expect(
      service.uncancelAppointment(appointmentId, businessId),
    ).rejects.toMatchObject({
      code: "BRANCH_NOT_FOUND",
      statusCode: 404,
    });

    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tx.appointment.updateMany).not.toHaveBeenCalled();
  });

  it("rejects reverting a completed appointment into an inactive branch", async () => {
    const tx = buildTx(AppointmentStatus.completed);
    mockDatabase(tx);

    const service = require("../src/modules/appointments/appointments.command.service")
      .default;

    await expect(
      service.revertAppointment(appointmentId, businessId),
    ).rejects.toMatchObject({
      code: "BRANCH_NOT_FOUND",
      statusCode: 404,
    });

    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tx.appointment.updateMany).not.toHaveBeenCalled();
  });

  it("rejects changing no-show back to an active status on an inactive branch", async () => {
    const tx = buildTx(AppointmentStatus.no_show);
    mockDatabase(tx);

    const service = require("../src/modules/appointments/appointments.command.service")
      .default;

    await expect(
      service.updateStatus(
        appointmentId,
        AppointmentStatus.confirmed,
        businessId,
      ),
    ).rejects.toMatchObject({
      code: "BRANCH_NOT_FOUND",
      statusCode: 404,
    });

    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tx.appointment.updateMany).not.toHaveBeenCalled();
  });
});
