import { AppointmentStatus } from "@prisma/client";
import { DateTime } from "luxon";
import appointmentsCommandService from "../src/modules/appointments/appointments.command.service";
import { prisma } from "../src/shared/db/prisma";

let businessId: string | null = null;

afterEach(async () => {
  if (!businessId) return;
  const id = businessId;
  businessId = null;
  await prisma.appointmentService.deleteMany({
    where: { appointment: { businessId: id } },
  });
  await prisma.appointment.deleteMany({ where: { businessId: id } });
  await prisma.business.delete({ where: { id } });
});

test("reschedule interprets bare local input in the appointment branch timezone and persists UTC", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const business = await prisma.business.create({
    data: {
      name: "Timezone Reschedule",
      slug: `timezone-reschedule-${suffix}`,
      vertical: "salon",
      phone: "+201234567890",
      timezone: "UTC",
      isActive: true,
    },
  });
  businessId = business.id;
  const branch = await prisma.branch.create({
    data: {
      businessId: business.id,
      name: "Main Branch",
      slug: "main",
      timezone: "Africa/Cairo",
      isActive: true,
    },
  });

  const staff = await prisma.staff.create({
    data: {
      businessId: business.id,
      branchId: branch.id,
      name: "Staff",
      isActive: true,
    },
  });
  const service = await prisma.service.create({
    data: {
      businessId: business.id,
      branchId: branch.id,
      name: "Service",
      durationMin: 30,
      priceEgp: 100,
      isActive: true,
    },
  });
  await prisma.serviceStaff.create({
    data: { staffId: staff.id, serviceId: service.id },
  });
  await prisma.availability.create({
    data: {
      staffId: staff.id,
      dayOfWeek: 1,
      startTime: new Date("1970-01-01T09:00:00.000Z"),
      endTime: new Date("1970-01-01T17:00:00.000Z"),
    },
  });
  const customer = await prisma.customer.create({
    data: {
      businessId: business.id,
      name: "Customer",
      phone: "+201000000555",
    },
  });

  const oldStart = DateTime.fromISO("2030-01-07T10:00:00", {
    zone: "Africa/Cairo",
  })
    .toUTC()
    .toJSDate();
  const appointment = await prisma.appointment.create({
    data: {
      businessId: business.id,
      branchId: branch.id,
      staffId: staff.id,
      customerId: customer.id,
      startsAt: oldStart,
      endsAt: new Date(oldStart.getTime() + 30 * 60 * 1000),
      status: AppointmentStatus.confirmed,
    },
  });
  await prisma.appointmentService.create({
    data: {
      appointmentId: appointment.id,
      serviceId: service.id,
      staffId: staff.id,
      startsAt: oldStart,
      endsAt: new Date(oldStart.getTime() + 30 * 60 * 1000),
      durationMinSnapshot: 30,
      priceEgpSnapshot: 100,
      order: 0,
    },
  });

  const updated = await appointmentsCommandService.rescheduleAppointment(
    appointment.id,
    business.id,
    "2030-01-07T11:00:00",
  );

  const expectedStart = DateTime.fromISO("2030-01-07T11:00:00", {
    zone: "Africa/Cairo",
  })
    .toUTC()
    .toJSDate();

  expect(updated.startsAt.toISOString()).toBe(expectedStart.toISOString());
  expect(updated.endsAt.toISOString()).toBe(
    new Date(expectedStart.getTime() + 30 * 60 * 1000).toISOString(),
  );
});
