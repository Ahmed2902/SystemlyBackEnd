import { prisma } from "../../shared/db/prisma";
import dayjs from "dayjs";
import { Roles, AppointmentStatus } from "@prisma/client";
import type {
  CreateManualAppointmentBody,
  ListAppointmentsQuery,
} from "./appointments.schema";

type ListAppointmentsInput = ListAppointmentsQuery & {
  user: Express.Request["user"];
};

export const listAppointments = async (opts: ListAppointmentsInput) => {
  const { user, date, from, to, page = 1, perPage = 20 } = opts;
  const where: any = {};

  // Role-based filtering: SuperAdmin sees all, others scoped to their business
  if (user.role !== Roles.SuperAdmin.toString()) {
    where.businessId = user.businessId;
  }

  if (date) {
    const dayStart = dayjs(date).startOf("day").toDate();
    const dayEnd = dayjs(date).endOf("day").toDate();
    where.AND = [{ startsAt: { lt: dayEnd } }, { endsAt: { gt: dayStart } }];
  } else if (from || to) {
    where.AND = [];
    if (from) where.AND.push({ startsAt: { gte: new Date(from) } });
    if (to) where.AND.push({ endsAt: { lte: new Date(to) } });
  }

  const skip = (page - 1) * perPage;
  const [items, total] = await Promise.all([
    prisma.appointment.findMany({
      where,
      skip,
      take: perPage,
      orderBy: { startsAt: "desc" },
      include: { customer: true, service: true, staff: true },
    }),
    prisma.appointment.count({ where }),
  ]);

  // Privacy: if the viewer is a staff member, strip customer phone/email for appointments
  // that belong to other staff members
  const masked = items.map((it: any) => {
    if (user.role === Roles.Staff.toString() && it.staffId !== user.id) {
      if (it.customer) {
        // shallow copy to avoid mutating original objects
        const ap = { ...it, customer: { ...it.customer } };
        ap.customer.phone = undefined;
        ap.customer.email = undefined;
        return ap;
      }
    }
    return it;
  });

  return { items: masked, total, page, perPage };
};

export const getAppointmentById = async (id: string) => {
  return prisma.appointment.findUnique({
    where: { id },
    include: { customer: true, service: true, staff: true },
  });
};

export const updateStatus = async (id: string, status: string) => {
  // validate status value exists in enum
  const validStatuses = Object.values(AppointmentStatus) as string[];
  if (!validStatuses.includes(status)) {
    const err: any = new Error("Invalid status");
    err.statusCode = 400;
    err.code = "INVALID_STATUS";
    throw err;
  }

  const appt = await prisma.appointment.update({
    where: { id },
    data: { status } as any,
  });
  return appt;
};

export const updateNotes = async (id: string, notes?: string) => {
  const appt = await prisma.appointment.update({
    where: { id },
    data: { notes },
  });
  return appt;
};

export const createManualAppointment = async (
  payload: CreateManualAppointmentBody
) => {
  const {
    businessId,
    serviceId,
    staffId,
    startsAt,
    customerName,
    customerPhone,
    notes,
  } = payload;

  // Use a transaction to avoid conflicts
  return prisma.$transaction(async (tx) => {
    const svc = await tx.service.findUnique({ where: { id: serviceId } });
    if (!svc) {
      const err: any = new Error("Service not found");
      err.statusCode = 404;
      throw err;
    }

    const starts = new Date(startsAt);
    const ends = new Date(starts.getTime() + svc.durationMin * 60 * 1000);

    const conflict = await tx.appointment.findFirst({
      where: {
        staffId,
        status: { notIn: ["cancelled_by_customer", "cancelled_by_business"] },
        AND: [{ startsAt: { lt: ends } }, { endsAt: { gt: starts } }],
      },
    });

    if (conflict) {
      const err: any = new Error("Slot taken");
      err.statusCode = 409;
      err.code = "SLOT_TAKEN";
      throw err;
    }

    // upsert customer
    const existing = await tx.customer.findUnique({
      where: {
        businessId_phone: { businessId, phone: customerPhone } as any,
      } as any,
    });
    let customer;
    if (existing) {
      customer = await tx.customer.update({
        where: { id: existing.id },
        data: {
          visitCount: { increment: 1 },
          lastVisitAt: new Date(),
          name: customerName || existing.name,
        } as any,
      });
    } else {
      customer = await tx.customer.create({
        data: {
          businessId,
          phone: customerPhone,
          name: customerName || "",
          visitCount: 1,
          lastVisitAt: new Date(),
        } as any,
      });
    }

    const appt = await tx.appointment.create({
      data: {
        businessId,
        staffId,
        serviceId,
        customerId: customer.id,
        startsAt: starts,
        endsAt: ends,
        status: "confirmed",
        notes: notes || null,
      } as any,
    });
    return { appointment: appt, customer };
  });
};

export const rescheduleAppointment = async (id: string, startsAt: string) => {
  // Use a transaction to check conflicts and update atomically
  return prisma.$transaction(async (tx) => {
    const appt = await tx.appointment.findUnique({
      where: { id },
      include: { service: true },
    });
    if (!appt) {
      const err: any = new Error("Appointment not found");
      err.statusCode = 404;
      err.code = "NOT_FOUND";
      throw err;
    }

    const svc = appt.service;
    if (!svc) {
      const err: any = new Error("Service not found");
      err.statusCode = 404;
      err.code = "NOT_FOUND";
      throw err;
    }

    const starts = new Date(startsAt);
    const ends = new Date(starts.getTime() + svc.durationMin * 60 * 1000);

    const conflict = await tx.appointment.findFirst({
      where: {
        staffId: appt.staffId,
        id: { not: id },
        status: { notIn: ["cancelled_by_customer", "cancelled_by_business"] },
        AND: [{ startsAt: { lt: ends } }, { endsAt: { gt: starts } }],
      },
    });

    if (conflict) {
      const err: any = new Error("Slot taken");
      err.statusCode = 409;
      err.code = "SLOT_TAKEN";
      throw err;
    }

    const updated = await tx.appointment.update({
      where: { id },
      data: {
        startsAt: starts,
        endsAt: ends,
        reminderSent: false,
        confirmationSent: false,
      } as any,
    });

    return updated;
  });
};

export default {
  listAppointments,
  getAppointmentById,
  updateStatus,
  updateNotes,
  createManualAppointment,
  rescheduleAppointment,
};
