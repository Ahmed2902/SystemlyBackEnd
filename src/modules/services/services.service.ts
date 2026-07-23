import { Prisma, Roles } from "@prisma/client";
import { prisma } from "../../shared/db/prisma";
import {
  UNCATEGORIZED_FILTER,
  type CreateServiceBody,
  type ListServicesQuery,
  type UpdateServiceBody,
} from "./services.schema";

type AuthUser = NonNullable<Express.Request["user"]>;

const buildError = (message: string, statusCode: number, code: string) => {
  const error = new Error(message) as Error & {
    statusCode: number;
    code: string;
  };
  error.statusCode = statusCode;
  error.code = code;
  return error;
};

const normalizeCategory = (value?: string | null) => {
  const normalized = value?.trim().replace(/\s+/g, " ");
  return normalized || null;
};

const canManageMoney = (role?: string) =>
  role === Roles.BusinessAdmin || role === Roles.SuperAdmin;

const serviceSelect = {
  id: true,
  businessId: true,
  name: true,
  description: true,
  category: true,
  durationMin: true,
  priceEgp: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  serviceStaff: {
    select: {
      staff: {
        select: {
          id: true,
          name: true,
          photoUrl: true,
          isActive: true,
        },
      },
    },
  },
} satisfies Prisma.ServiceSelect;

class ServicesService {
  async getCatalog(user: AuthUser, query: ListServicesQuery) {
    const businessId = user.businessId;
    if (!businessId) {
      throw buildError("Business id missing", 400, "BAD_REQUEST");
    }

    const baseWhere: Prisma.ServiceWhereInput = { businessId };

    if (query.search) {
      baseWhere.OR = [
        { name: { contains: query.search, mode: "insensitive" } },
        { description: { contains: query.search, mode: "insensitive" } },
        { category: { contains: query.search, mode: "insensitive" } },
      ];
    }

    if (query.status === "active") baseWhere.isActive = true;
    if (query.status === "inactive") baseWhere.isActive = false;

    const where: Prisma.ServiceWhereInput = { ...baseWhere };
    if (query.category === UNCATEGORIZED_FILTER) {
      where.AND = [
        {
          OR: [
            { category: null },
            { category: { equals: "Uncategorized", mode: "insensitive" } },
          ],
        },
      ];
    } else if (query.category) {
      where.category = { equals: query.category, mode: "insensitive" };
    }

    const [items, categoryServices, staff] = await Promise.all([
      prisma.service.findMany({
        where,
        select: serviceSelect,
        orderBy: [{ isActive: "desc" }, { category: "asc" }, { name: "asc" }],
      }),
      prisma.service.findMany({
        where: baseWhere,
        select: {
          id: true,
          name: true,
          category: true,
          durationMin: true,
          priceEgp: true,
          isActive: true,
        },
        orderBy: [{ category: "asc" }, { name: "asc" }],
      }),
      prisma.staff.findMany({
        where: { businessId, isActive: true },
        select: { id: true, name: true, photoUrl: true },
        orderBy: { name: "asc" },
      }),
    ]);

    const categoryMap = new Map<
      string,
      {
        name: string;
        value: string;
        total: number;
        active: number;
        services: typeof categoryServices;
      }
    >();

    for (const service of categoryServices) {
      const normalizedCategory = normalizeCategory(service.category);
      const categoryName = normalizedCategory ?? "Uncategorized";
      const categoryValue = normalizedCategory ?? UNCATEGORIZED_FILTER;
      const key = categoryName.toLocaleLowerCase();
      const existing = categoryMap.get(key) ?? {
        name: categoryName,
        value: categoryValue,
        total: 0,
        active: 0,
        services: [],
      };
      existing.total += 1;
      if (service.isActive) existing.active += 1;
      if (existing.services.length < 3) existing.services.push(service);
      categoryMap.set(key, existing);
    }

    const showMoney = canManageMoney(user.role);
    const mapService = <T extends { priceEgp: Prisma.Decimal }>(service: T) => ({
      ...service,
      priceEgp: showMoney ? Number(service.priceEgp) : undefined,
    });

    return {
      items: items.map((service) => ({
        ...mapService(service),
        category: normalizeCategory(service.category),
        eligibleStaff: service.serviceStaff.map(({ staff: member }) => member),
        serviceStaff: undefined,
      })),
      categories: [...categoryMap.values()].map((category) => ({
        ...category,
        services: category.services.map(mapService),
      })),
      staff,
      canManageMoney: showMoney,
      total: items.length,
      activeTotal: items.filter((service) => service.isActive).length,
    };
  }

  async createService(user: AuthUser, payload: CreateServiceBody) {
    const businessId = user.businessId;
    if (!businessId) {
      throw buildError("Business id missing", 400, "BAD_REQUEST");
    }

    await this.assertStaffBelongToBusiness(businessId, payload.staffIds);

    return prisma.$transaction(async (tx) => {
      const service = await tx.service.create({
        data: {
          businessId,
          name: payload.name,
          description: payload.description || null,
          category: normalizeCategory(payload.category),
          durationMin: payload.durationMin,
          priceEgp: canManageMoney(user.role) ? (payload.priceEgp ?? 0) : 0,
          isActive: payload.isActive,
        },
      });

      if (payload.staffIds.length > 0) {
        await tx.serviceStaff.createMany({
          data: payload.staffIds.map((staffId) => ({
            serviceId: service.id,
            staffId,
          })),
          skipDuplicates: true,
        });
      }

      return service;
    });
  }

  async updateService(id: string, user: AuthUser, payload: UpdateServiceBody) {
    const businessId = user.businessId;
    if (!businessId) {
      throw buildError("Business id missing", 400, "BAD_REQUEST");
    }

    const existing = await prisma.service.findFirst({
      where: { id, businessId },
      select: { id: true },
    });
    if (!existing) {
      throw buildError("Service not found", 404, "NOT_FOUND");
    }

    if (payload.staffIds) {
      await this.assertStaffBelongToBusiness(businessId, payload.staffIds);
    }

    const { staffIds, priceEgp, category, ...fields } = payload;
    const data: Prisma.ServiceUpdateInput = {
      ...fields,
      ...(category !== undefined && { category: normalizeCategory(category) }),
      ...(canManageMoney(user.role) && priceEgp !== undefined && { priceEgp }),
    };

    return prisma.$transaction(async (tx) => {
      const service = await tx.service.update({
        where: { id },
        data,
      });

      if (staffIds) {
        await tx.serviceStaff.deleteMany({ where: { serviceId: id } });
        if (staffIds.length > 0) {
          await tx.serviceStaff.createMany({
            data: staffIds.map((staffId) => ({ serviceId: id, staffId })),
            skipDuplicates: true,
          });
        }
      }

      return service;
    });
  }

  async archiveService(id: string, user: AuthUser) {
    const businessId = user.businessId;
    if (!businessId) {
      throw buildError("Business id missing", 400, "BAD_REQUEST");
    }

    const result = await prisma.service.updateMany({
      where: { id, businessId },
      data: { isActive: false },
    });

    if (result.count === 0) {
      throw buildError("Service not found", 404, "NOT_FOUND");
    }

    return { id, isActive: false };
  }

  private async assertStaffBelongToBusiness(
    businessId: string,
    staffIds: string[],
  ) {
    if (staffIds.length === 0) return;

    const uniqueIds = [...new Set(staffIds)];
    const count = await prisma.staff.count({
      where: { id: { in: uniqueIds }, businessId },
    });

    if (count !== uniqueIds.length) {
      throw buildError(
        "One or more selected staff members do not belong to this business",
        400,
        "INVALID_STAFF_SELECTION",
      );
    }
  }
}

const servicesService = new ServicesService();
export default servicesService;
