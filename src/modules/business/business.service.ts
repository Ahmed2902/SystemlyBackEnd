import { prisma } from "../../shared/db/prisma";

export const isSlugTaken = async (slug: string) => {
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

export default {
  isSlugTaken,
  getPublicBySlug,
};
