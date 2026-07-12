import { prisma } from "../../shared/db/prisma";
import { Prisma, Roles } from "@prisma/client";
import { signAccessToken } from "../../shared/utils/token.util";
import type {
  BusinessUpdateInput,
  CreateBusinessInput,
} from "./business.schema";
import type { WebsiteContentInput } from "../website-content/website-content.schema";
import {
  getVerticalConfig,
  isValidVertical,
} from "../../shared/config/verticals.config";

const buildErr = (message: string, statusCode: number, code: string) => {
  const err: any = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  return err;
};

class BusinessService {
  async isSlugTaken(slug: string): Promise<boolean> {
    const found = await prisma.business.findUnique({ where: { slug } });
    return !!found;
  }

  async createBusinessForUser(
    userId: string,
    userRole: string | undefined,
    payload: CreateBusinessInput,
  ) {
    if (!isValidVertical(payload.vertical)) {
      throw buildErr("Invalid vertical", 400, "INVALID_VERTICAL");
    }

    const user = await prisma.businessUser.findUnique({
      where: { id: userId },
    });
    if (!user) throw buildErr("User not found", 404, "NOT_FOUND");
    if (user.businessId) {
      throw buildErr(
        "User already has a business",
        409,
        "ALREADY_HAS_BUSINESS",
      );
    }

    const taken = await this.isSlugTaken(payload.slug);
    if (taken) {
      throw buildErr("Slug already taken", 409, "SLUG_TAKEN");
    }

    const { ...businessFields } = payload;

    const result = await prisma.$transaction(async (tx) => {
      const business = await tx.business.create({
        data: {
          ...businessFields,
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

    return { ...result, verticalConfig: getVerticalConfig(payload.vertical) };
  }

  async getAllBusinesses() {
    const businesses = await prisma.business.findMany({
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
    if (!businesses) {
      const err: any = new Error("Business not found");
      err.statusCode = 404;
      err.code = "NOT_FOUND";
      throw err;
    }

    return businesses;
  }

  async getPublicBySlug(slug: string) {
    const business = await prisma.business.findUnique({
      where: { slug },
      include: {
        websiteContent: true,
        services: {
          include: {
            serviceStaff: {
              where: { staff: { isActive: true } },
              select: { staffId: true },
            },
          },
        },
        staff: { where: { isActive: true } },
        faqs: { orderBy: { displayOrder: "asc" } },
        photos: { orderBy: { position: "asc" } },
      },
    });
    if (!business || !business.isActive) return null;
    return {
      ...business,
      services: business.services.map((s) => ({
        ...s, // to reshape for the frontend
        serviceStaff: undefined, // dont need it
        staffIds: s.serviceStaff.map((ss) => ss.staffId), //flatten to staff ids of the staff eligible for this service
      })),
    };
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

  // async getStats(id: string): Promise<BusinessStats> {
  //   const dashboard = await analyticsService.getDashboardOverview(id);
  //   return dashboard.summary;
  // }
}

const businessService = new BusinessService();
export default businessService;
