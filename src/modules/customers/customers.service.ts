import { prisma } from "../../shared/db/prisma";

class CustomersService {
  async listCustomers(
    businessId: string,
    search?: string,
    page = 1,
    perPage = 20,
  ) {
    const where: any = { businessId };
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { phone: { contains: search } },
      ];
    }
    const skip = (page - 1) * perPage;
    const [items, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        skip,
        take: perPage,
        orderBy: { updatedAt: "desc" },
      }),
      prisma.customer.count({ where }),
    ]);
    return { items, total, page, perPage };
  }

  async getCustomerById(id: string) {
    return prisma.customer.findUnique({ where: { id } });
  }

  async updateNotes(id: string, notes?: string) {
    return prisma.customer.update({ where: { id }, data: { notes } });
  }

  async getAppointments(customerId: string) {
    return prisma.appointment.findMany({
      where: { customerId },
      orderBy: { startsAt: "desc" },
      include: { appointmentServices: true, staff: true, invoice: true },
    });
  }

  async upsertByPhone(
    businessId: string,
    phone: string,
    name?: string,
    acquisitionSource?: string,
  ) {
    const existing = await prisma.customer.findUnique({
      where: { businessId_phone: { businessId, phone } } as any,
    });
    if (existing) {
      const updated = await prisma.customer.update({
        where: { id: existing.id },
        data: {
          visitCount: { increment: 1 },
          lastVisitAt: new Date(),
          name: name || existing.name,
          acquisitionSource: acquisitionSource || existing.acquisitionSource,
        } as any,
      });
      return updated;
    }
    const created = await prisma.customer.create({
      data: {
        businessId,
        phone,
        name: name || "",
        visitCount: 1,
        lastVisitAt: new Date(),
        acquisitionSource,
      },
    });
    return created;
  }
}

const customersService = new CustomersService();
export default customersService;

// Backwards-compatible named exports (prefer default export going forward)
export const listCustomers =
  customersService.listCustomers.bind(customersService);
export const getCustomerById =
  customersService.getCustomerById.bind(customersService);
export const updateNotes = customersService.updateNotes.bind(customersService);
export const getAppointments =
  customersService.getAppointments.bind(customersService);
export const upsertByPhone =
  customersService.upsertByPhone.bind(customersService);
