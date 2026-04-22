import { prisma } from "../../shared/db/prisma";
import type {
  StaffCreateInput,
  StaffUpdateInput,
  AvailabilityEntry,
  AvailabilityOverrideInput,
  StaffListResult,
} from "./staff.schema";

export const listByBusiness = async (
  businessId: string,
  page = 1,
  perPage = 20
): Promise<StaffListResult> => {
  const where = { businessId } as any;
  const skip = (page - 1) * perPage;
  const [items, total] = await Promise.all([
    prisma.staff.findMany({
      where,
      skip,
      take: perPage,
      orderBy: { updatedAt: "desc" },
    }),
    prisma.staff.count({ where }),
  ]);
  return { items, total, page, perPage };
};

export const createStaff = async (
  businessId: string,
  payload: StaffCreateInput
) => {
  const created = await prisma.staff.create({
    data: { businessId, ...payload },
  });
  return created;
};

export const updateStaff = async (id: string, payload: StaffUpdateInput) => {
  const updated = await prisma.staff.update({ where: { id }, data: payload });
  return updated;
};

export const deleteStaff = async (id: string) => {
  await prisma.staff.delete({ where: { id } });
  return { success: true };
};

export const assignService = async (staffId: string, serviceId: string) => {
  const row = await prisma.serviceStaff.create({
    data: { staffId, serviceId },
  });
  return row;
};

export const unassignService = async (staffId: string, serviceId: string) => {
  const row = await prisma.serviceStaff.delete({
    where: { serviceId_staffId: { serviceId, staffId } },
  });
  return row;
};

export const getAvailability = async (staffId: string) => {
  const avail = await prisma.availability.findMany({
    where: { staffId },
    orderBy: { dayOfWeek: "asc" },
  });
  return avail;
};

export const replaceAvailability = async (
  staffId: string,
  entries: AvailabilityEntry[]
) => {
  await prisma.availability.deleteMany({ where: { staffId } });
  const data = entries.map((e) => ({
    staffId,
    dayOfWeek: e.dayOfWeek,
    startTime: new Date(e.startTime),
    endTime: new Date(e.endTime),
    breakAfterMin: e.breakAfterMin ?? null,
  }));
  await prisma.availability.createMany({ data });
  return { success: true };
};

export const addOverride = async (
  staffId: string,
  payload: AvailabilityOverrideInput
) => {
  const created = await prisma.availabilityOverride.create({
    data: {
      staffId,
      overrideDate: new Date(payload.overrideDate),
      isDayOff: payload.isDayOff ?? false,
      startTime: payload.startTime ? new Date(payload.startTime) : null,
      endTime: payload.endTime ? new Date(payload.endTime) : null,
    },
  });
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
