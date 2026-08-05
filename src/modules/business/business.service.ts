import { Roles } from "@prisma/client";
import {
  getVerticalConfig,
  isValidVertical,
} from "../../shared/config/verticals.config";
import { prisma } from "../../shared/db/prisma";
import { signAccessToken } from "../../shared/utils/token.util";
import {
  findPublicBusinessGateBySlug,
  requirePublicFeature,
} from "../subscriptions/public-subscription-access.service";
import { ENTITLEMENTS } from "../subscriptions/subscription.catalog";
import { startLifetimeTrial } from "../subscriptions/subscription.service";
import type {
  BusinessUpdateInput,
  CreateBusinessInput,
} from "./business.schema";

const buildErr = (message: string, statusCode: number, code: string) => {
  const error = new Error(message) as Error & {
    statusCode?: number;
    code?: string;
  };
  error.statusCode = statusCode;
  error.code = code;
  return error;
};

class BusinessService {
  async isSlugTaken(slug: string): Promise<boolean> {
    return Boolean(await prisma.business.findUnique({ where: { slug } }));
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

    if (await this.isSlugTaken(payload.slug)) {
      throw buildErr("Slug already taken", 409, "SLUG_TAKEN");
    }

    const result = await prisma.$transaction(async (tx) => {
      const business = await tx.business.create({
        data: payload,
        include: { websiteContent: true },
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

      await startLifetimeTrial(tx, business.id);
      const accessToken = signAccessToken({
        userId: updatedUser.id,
        businessId: updatedUser.businessId,
        role: updatedUser.role,
      });

      return { business, user: updatedUser, accessToken };
    });

    return {
      business: result.business,
      user: result.user,
      accessToken: result.accessToken,
      verticalConfig: getVerticalConfig(payload.vertical),
    };
  }

  getAllBusinesses() {
    return prisma.business.findMany({
      where: { deletedAt: null },
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
  }

  async getPublicBySlug(slug: string) {
    const gate = await findPublicBusinessGateBySlug(slug);
    if (!gate || gate.deletedAt || !gate.isActive) return null;

    requirePublicFeature(gate, ENTITLEMENTS.PUBLIC_WEBSITE);

    const business = await prisma.business.findUnique({
      where: { id: gate.id },
      select: {
        id: true,
        name: true,
        slug: true,
        vertical: true,
        phone: true,
        address: true,
        city: true,
        lat: true,
        lng: true,
        logoUrl: true,
        coverUrl: true,
        timezone: true,
        language: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        websiteContent: true,
        services: {
          where: { isActive: true },
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
      services: business.services.map((service) => ({
        ...service,
        serviceStaff: undefined,
        staffIds: service.serviceStaff.map((entry) => entry.staffId),
      })),
    };
  }

  updateBusiness(id: string, payload: BusinessUpdateInput) {
    return prisma.business.update({ where: { id }, data: payload });
  }

  publishBusiness(id: string, isActive: boolean) {
    return prisma.business.update({ where: { id }, data: { isActive } });
  }
}

const businessService = new BusinessService();
export default businessService;
