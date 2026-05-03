import { prisma } from "../../shared/db/prisma";
import { Prisma, Roles } from "@prisma/client";
import { signAccessToken } from "../../shared/utils/token.util";
import type {
  BusinessUpdateInput,
  BusinessStats,
  CreateBusinessInput,
} from "./business.schema";
import type { WebsiteContentInput } from "../website-content/website-content.schema";

const buildErr = (message: string, statusCode: number, code: string) => {
  const err: any = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  return err;
};

const toWebsiteContentCreateInput = (
  payload?: WebsiteContentInput
): Prisma.WebsiteContentCreateWithoutBusinessInput => {
  if (!payload) return {};
  const { sectionOrder, ...rest } = payload;
  return {
    ...rest,
    ...(sectionOrder !== undefined
      ? { sectionOrder: sectionOrder as Prisma.InputJsonValue }
      : {}),
  };
};

class BusinessService {
  async isSlugTaken(slug: string): Promise<boolean> {
    const found = await prisma.business.findUnique({ where: { slug } });
    return !!found;
  }

  async createBusinessForUser(
    userId: string,
    userRole: string | undefined,
    payload: CreateBusinessInput
  ) {
    const user = await prisma.businessUser.findUnique({ where: { id: userId } });
    if (!user) throw buildErr("User not found", 404, "NOT_FOUND");
    if (user.businessId) {
      throw buildErr(
        "User already has a business",
        409,
        "ALREADY_HAS_BUSINESS"
      );
    }

    const taken = await this.isSlugTaken(payload.slug);
    if (taken) {
      throw buildErr("Slug already taken", 409, "SLUG_TAKEN");
    }

    const { websiteContent, ...businessFields } = payload;

    const result = await prisma.$transaction(async (tx) => {
      const business = await tx.business.create({
        data: {
          ...businessFields,
          websiteContent: {
            create: toWebsiteContentCreateInput(websiteContent),
          },
        },
        include: {
          websiteContent: true,
        },
      });

      const nextRole =
        userRole === Roles.SuperAdmin.toString()
          ? Roles.SuperAdmin
          : Roles.BusinessAdmin;

      const updatedUser = await tx.businessUser.update({
        where: { id: userId },
        data: { businessId: business.id, role: nextRole },
        select: {
          id: true,
          name: true,
          email: true,
          businessId: true,
          role: true,
        },
      });

      const accessToken = signAccessToken({
        userId: updatedUser.id,
        businessId: updatedUser.businessId,
        role: updatedUser.role,
      });

      return { business, user: updatedUser, accessToken };
    });

    return result;
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
export const createBusinessForUser =
  businessService.createBusinessForUser.bind(businessService);
export const getPublicBySlug =
  businessService.getPublicBySlug.bind(businessService);
export const updateBusiness =
  businessService.updateBusiness.bind(businessService);
export const publishBusiness =
  businessService.publishBusiness.bind(businessService);
export const getStats = businessService.getStats.bind(businessService);
