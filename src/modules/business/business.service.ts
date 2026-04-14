import { prisma } from "../../shared/db/prisma";

export const isSlugTaken = async (slug: string) => {
  const found = await prisma.business.findUnique({ where: { slug } });
  return !!found;
};

export const findById = async (id: string) => {
  return prisma.business.findUnique({ where: { id } });
};

export default { isSlugTaken, findById };
