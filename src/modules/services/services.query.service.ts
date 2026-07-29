import { Prisma, Roles } from "@prisma/client";
import { prisma } from "../../shared/db/prisma";
import {
  UNCATEGORIZED_FILTER,
  type ListServicesQuery,
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

class ServicesQueryService {
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

    const showMoney = canManageMoney(user.role);

    if (query.view === "booking") {
      const items = await prisma.service.findMany({
        where,
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          durationMin: true,
          priceEgp: true,
          isActive: true,
          serviceStaff: {
            where: { staff: { isActive: true } },
            orderBy: { staff: { name: "asc" } },
            select: {
              staff: {
                select: {
                  id: true,
                  name: true,
                  role: true,
                  photoUrl: true,
                  isActive: true,
                },
              },
            },
          },
        },
      });

      return {
        items: items.map(({ serviceStaff, priceEgp, ...service }) => ({
          ...service,
          priceEgp: showMoney ? Number(priceEgp) : undefined,
          eligibleStaff: serviceStaff.map(({ staff }) => staff),
        })),
        categories: [],
        staff: [],
        canManageMoney: showMoney,
        total: items.length,
        activeTotal: items.filter((service) => service.isActive).length,
      };
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
}

export default new ServicesQueryService();
