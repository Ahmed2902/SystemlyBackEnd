import { Prisma, Roles } from "@prisma/client";
import {
  getVerticalConfig,
  isValidVertical,
} from "../../shared/config/verticals.config";
import { prisma } from "../../shared/db/prisma";
import { signAccessToken } from "../../shared/utils/token.util";
import {
  findPublicBusinessGateBySlug,
  hasPublicFeature,
  publicBusinessGateSelect,
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

    if (await this.isSlugTaken(payload.slug)) {
      throw buildErr("Slug already taken", 409, "SLUG_TAKEN");
    }

    const result = await prisma.$transaction(async (tx) => {
      const [lockedUser] = await tx.$queryRaw<
        Array<{ businessId: string | null }>
      >(Prisma.sql`
        SELECT business_id AS "businessId"
        FROM business_users
        WHERE id = CAST(${userId} AS uuid)
        FOR UPDATE
      `);

      if (!lockedUser) throw buildErr("User not found", 404, "NOT_FOUND");
      if (lockedUser.businessId) {
        throw buildErr(
          "User already has a business",
          409,
          "ALREADY_HAS_BUSINESS",
        );
      }

      const business = await tx.business.create({
        data: payload,
        include: { websiteContent: true },
      });

      await tx.branch.create({
        data: {
          businessId: business.id,
          name: "Main Branch",
          slug: "main",
          phone: business.phone,
          address: business.address,
          city: business.city,
          lat: business.lat,
          lng: business.lng,
          timezone: business.timezone,
        },
      });

      const nextRole =
        userRole === Roles.SuperAdmin.toString()
          ? Roles.SuperAdmin
          : Roles.BusinessAdmin;

      const updatedUser = await tx.businessUser.update({
        where: { id: userId },
        data: { businessId: business.id, branchId: null, role: nextRole },
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

  async getPublicBySlug(slug: string, branchSlug?: string) {
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
        branches: {
          where: { isActive: true },
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            name: true,
            slug: true,
            phone: true,
            address: true,
            city: true,
            lat: true,
            lng: true,
            timezone: true,
          },
        },
        faqs: {
          orderBy: { displayOrder: "asc" },
          select: {
            id: true,
            question: true,
            answer: true,
            displayOrder: true,
          },
        },
        photos: {
          where: { kind: "gallery" },
          orderBy: { position: "asc" },
          select: {
            id: true,
            url: true,
            type: true,
            position: true,
          },
        },
      },
    });
    if (!business || !business.isActive) return null;
    if (business.branches.length === 0) {
      throw buildErr("No active branch is available", 409, "NO_ACTIVE_BRANCH");
    }

    const selectedBranch = branchSlug
      ? business.branches.find((branch) => branch.slug === branchSlug)
      : business.branches[0];
    if (!selectedBranch) {
      throw buildErr("Branch not found", 404, "BRANCH_NOT_FOUND");
    }

    const [services, staff] = await Promise.all([
      prisma.service.findMany({
        where: {
          businessId: business.id,
          branchId: selectedBranch.id,
          isActive: true,
        },
        orderBy: { name: "asc" },
        select: {
          id: true,
          branchId: true,
          name: true,
          durationMin: true,
          priceEgp: true,
          description: true,
          category: true,
          serviceStaff: {
            where: {
              staff: {
                isActive: true,
                branchId: selectedBranch.id,
              },
            },
            select: { staffId: true },
          },
        },
      }),
      prisma.staff.findMany({
        where: {
          businessId: business.id,
          branchId: selectedBranch.id,
          isActive: true,
        },
        orderBy: { name: "asc" },
        select: {
          id: true,
          branchId: true,
          name: true,
          jobTitle: true,
          yearsExperience: true,
          bio: true,
          photoUrl: true,
        },
      }),
    ]);

    return {
      ...business,
      phone: selectedBranch.phone,
      address: selectedBranch.address,
      city: selectedBranch.city,
      lat: selectedBranch.lat,
      lng: selectedBranch.lng,
      timezone: selectedBranch.timezone,
      selectedBranch,
      services: services.map(({ serviceStaff, ...service }) => ({
        ...service,
        staffIds: serviceStaff.map((entry) => entry.staffId),
      })),
      staff,
    };
  }

  async getPublicSitemapEntries() {
    const businesses = await prisma.business.findMany({
      where: { deletedAt: null, isActive: true },
      select: publicBusinessGateSelect,
      orderBy: { updatedAt: "desc" },
    });

    return businesses
      .filter((business) => hasPublicFeature(business, ENTITLEMENTS.PUBLIC_WEBSITE))
      .map(({ slug, updatedAt }) => ({ slug, updatedAt }));
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
