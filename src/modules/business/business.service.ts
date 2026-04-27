import { prisma } from "../../shared/db/prisma";
import type { BusinessUpdateInput, BusinessStats } from "./business.schema";

class BusinessService {
  async isSlugTaken(slug: string): Promise<boolean> {
    const found = await prisma.business.findUnique({ where: { slug } });
    return !!found;
  }

  async getPublicBySlug(slug: string) {
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
  }

  async updateBusiness(id: string, payload: BusinessUpdateInput) {
    return prisma.business.update({
      where: { id },
      data: payload,
    });
  }

  async publishBusiness(id: string, isActive: boolean) {
    return prisma.business.update({
      where: { id },
      data: { isActive },
    });
  }

  async getStats(id: string): Promise<BusinessStats> {
    const [customersCount, appointmentsCount, servicesCount, staffCount] =
      await Promise.all([
        prisma.customer.count({ where: { businessId: id } }),
        prisma.appointment.count({ where: { businessId: id } }),
        prisma.service.count({ where: { businessId: id } }),
        prisma.staff.count({ where: { businessId: id } }),
      ]);
    return { customersCount, appointmentsCount, servicesCount, staffCount };
  }
}

const businessService = new BusinessService();
export default businessService;

export const isSlugTaken = businessService.isSlugTaken.bind(businessService);
export const getPublicBySlug =
  businessService.getPublicBySlug.bind(businessService);
export const updateBusiness =
  businessService.updateBusiness.bind(businessService);
export const publishBusiness =
  businessService.publishBusiness.bind(businessService);
export const getStats = businessService.getStats.bind(businessService);
