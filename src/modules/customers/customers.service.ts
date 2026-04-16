import { prisma } from "../../shared/db/prisma";

export const listCustomers = async (
  businessId: string,
  search?: string,
  page = 1,
  perPage = 20
) => {
  const where: any = { businessId };
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { phone: { contains: search } },
    ];
  }
  const skip = (page - 1) * perPage;
  const [items, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      skip,
      take: perPage,
      orderBy: { updatedAt: "desc" },
    }),
    prisma.customer.count({ where }),
  ]);
  return { items, total, page, perPage };
};

export const getCustomerById = async (id: string) =>
  prisma.customer.findUnique({ where: { id } });

export const updateNotes = async (id: string, notes?: string) =>
  prisma.customer.update({ where: { id }, data: { notes } });

export const getAppointments = async (customerId: string) =>
  prisma.appointment.findMany({
    where: { customerId },
    orderBy: { startsAt: "desc" },
  });

export const upsertByPhone = async (
  businessId: string,
  phone: string,
  name?: string
) => {
  const existing = await prisma.customer.findUnique({
    where: { businessId_phone: { businessId, phone } } as any,
  });
  if (existing) {
    const updated = await prisma.customer.update({
      where: { id: existing.id },
      data: {
        visitCount: { increment: 1 },
        lastVisitAt: new Date(),
        name: name || existing.name,
      } as any,
    });
    return updated;
  }
  const created = await prisma.customer.create({
    data: {
      businessId,
      phone,
      name: name || "",
      visitCount: 1,
      lastVisitAt: new Date(),
    },
  });
  return created;
};

export default {
  listCustomers,
  getCustomerById,
  updateNotes,
  getAppointments,
  upsertByPhone,
};
