import { prisma } from "../../shared/db/prisma";
import type { CreateServiceBody, UpdateServiceBody } from "./services.schema";

class ServicesService {
  async listByBusiness(businessId: string) {
    return prisma.service.findMany({ where: { businessId } });
  }

  async createService(businessId: string, payload: CreateServiceBody) {
    return prisma.service.create({
      data: { businessId, ...payload },
    });
  }

  async updateService(id: string, payload: UpdateServiceBody) {
    return prisma.service.update({ where: { id }, data: payload });
  }

  async deleteService(id: string) {
    await prisma.service.delete({ where: { id } });
    return { success: true };
  }
}

const servicesService = new ServicesService();
export default servicesService;

export const listByBusiness = servicesService.listByBusiness.bind(servicesService);
export const createService = servicesService.createService.bind(servicesService);
export const updateService = servicesService.updateService.bind(servicesService);
export const deleteService = servicesService.deleteService.bind(servicesService);
