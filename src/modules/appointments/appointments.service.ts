import { prisma } from "../../shared/db/prisma";
import dayjs from "dayjs";

export const listAppointments = async (opts: any) => {
  const { user, date, from, to, page = 1, perPage = 20 } = opts;
  const where: any = {};

  // Role-based filtering
  if (user.role === "Staff") {
    where.staffId = user.id;
  } else if (user.role === "BusinessAdmin") {
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
    }),
    prisma.appointment.count({ where }),
  ]);
  return { items, total, page, perPage };
};

export const getAppointmentById = async (id: string) => {
  return prisma.appointment.findUnique({ where: { id } });
};

export const updateStatus = async (id: string, status: string) => {
  // TODO: validate allowed transitions
  const appt = await prisma.appointment.update({
    where: { id },
    data: { status } as any,
  });
  return appt;
};

export const updateNotes = async (id: string, notes: string) => {
  const appt = await prisma.appointment.update({
    where: { id },
    data: { notes },
  });
  return appt;
};

export const createManualAppointment = async (payload: any) => {
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

export default {
  listAppointments,
  getAppointmentById,
  updateStatus,
  updateNotes,
  createManualAppointment,
};
