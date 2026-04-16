import { prisma } from "../../shared/db/prisma";
import type { BusinessUpdateInput, BusinessStats } from "./business.schema";

export const isSlugTaken = async (slug: string): Promise<boolean> => {
  const found = await prisma.business.findUnique({ where: { slug } });
  return !!found;
};

export const getPublicBySlug = async (slug: string) => {
  const business = await prisma.business.findUnique({
    where: { slug },
    include: {
      websiteContent: true,
      services: {
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          durationMin: true,
          priceEgp: true,
          description: true,
        },
      },
      staff: {
        where: { isActive: true },
        select: { id: true, name: true, photoUrl: true },
      },
      faqs: { orderBy: { displayOrder: "asc" } },
    },
  });

  if (!business) {
    const err: any = new Error("Business not found");
    err.statusCode = 404;
    err.code = "NOT_FOUND";
    throw err;
  }

  return business;
};

export const updateBusiness = async (
  id: string,
  payload: BusinessUpdateInput
) => {
  const updated = await prisma.business.update({
    where: { id },
    data: payload,
  });
  return updated;
};

export const publishBusiness = async (id: string, isActive: boolean) => {
  const updated = await prisma.business.update({
    where: { id },
    data: { isActive },
  });
  return updated;
};

export const getStats = async (id: string): Promise<BusinessStats> => {
  const [customersCount, appointmentsCount, servicesCount, staffCount] =
    await Promise.all([
      prisma.customer.count({ where: { businessId: id } }),
      prisma.appointment.count({ where: { businessId: id } }),
      prisma.service.count({ where: { businessId: id } }),
      prisma.staff.count({ where: { businessId: id } }),
    ]);
  return { customersCount, appointmentsCount, servicesCount, staffCount };
};

export default {
  isSlugTaken,
  getPublicBySlug,
  updateBusiness,
  publishBusiness,
  getStats,
};
