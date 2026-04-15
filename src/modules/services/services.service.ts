import { prisma } from "../../shared/db/prisma";

export const listByBusiness = async (businessId: string) =>
  prisma.service.findMany({ where: { businessId } });

export const createService = async (businessId: string, payload: any) => {
  const created = await prisma.service.create({ data: { businessId, ...payload } });
  return created;
};

export const updateService = async (id: string, payload: any) => {
  const updated = await prisma.service.update({ where: { id }, data: payload });
  return updated;
};

export const deleteService = async (id: string) => {
  await prisma.service.delete({ where: { id } });
  return { success: true };
};

export default { listByBusiness, createService, updateService, deleteService };
