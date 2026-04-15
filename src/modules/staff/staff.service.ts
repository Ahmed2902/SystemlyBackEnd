import { prisma } from "../../shared/db/prisma";

export const listByBusiness = async (businessId: string) =>
  prisma.staff.findMany({ where: { businessId } });

export const createStaff = async (businessId: string, payload: any) => {
  const created = await prisma.staff.create({ data: { businessId, ...payload } });
  return created;
};

export const updateStaff = async (id: string, payload: any) => {
  const updated = await prisma.staff.update({ where: { id }, data: payload });
  return updated;
};

export const deleteStaff = async (id: string) => {
  await prisma.staff.delete({ where: { id } });
  return { success: true };
};

export const assignService = async (staffId: string, serviceId: string) => {
  const row = await prisma.serviceStaff.create({ data: { staffId, serviceId } });
  return row;
};

export const unassignService = async (staffId: string, serviceId: string) => {
  const row = await prisma.serviceStaff.delete({
    where: { serviceId_staffId: { serviceId, staffId } },
  });
  return row;
};

export const getAvailability = async (staffId: string) => {
  const avail = await prisma.availability.findMany({ where: { staffId }, orderBy: { dayOfWeek: "asc" } });
  return avail;
};

export const replaceAvailability = async (staffId: string, entries: any[]) => {
  await prisma.availability.deleteMany({ where: { staffId } });
  const data = entries.map((e) => ({ staffId, ...e }));
  await prisma.availability.createMany({ data });
  return { success: true };
};

export const addOverride = async (staffId: string, payload: any) => {
  const created = await prisma.availabilityOverride.create({ data: { staffId, ...payload } });
  return created;
};

export const deleteOverride = async (id: string) => {
  await prisma.availabilityOverride.delete({ where: { id } });
  return { success: true };
};

export default {
  listByBusiness,
  createStaff,
  updateStaff,
  deleteStaff,
  assignService,
  unassignService,
  getAvailability,
  replaceAvailability,
  addOverride,
  deleteOverride,
};
