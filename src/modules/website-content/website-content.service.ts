import { prisma } from "../../shared/db/prisma";

export const getByBusinessId = async (businessId: string) => {
  const content = await prisma.websiteContent.findUnique({ where: { businessId } });
  return content;
};

export const upsertByBusinessId = async (businessId: string, payload: any) => {
  const existing = await prisma.websiteContent.findUnique({ where: { businessId } });
  if (existing) {
    return prisma.websiteContent.update({ where: { businessId }, data: payload });
  }
  return prisma.websiteContent.create({ data: { businessId, ...payload } });
};

export default { getByBusinessId, upsertByBusinessId };
