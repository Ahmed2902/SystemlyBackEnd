import { prisma } from "../../shared/db/prisma";
import type {
  CreateFaqBody,
  ReorderFaqsBody,
  UpdateFaqBody,
} from "./faqs.schema";

class FaqsService {
  async listByBusiness(businessId: string) {
    return prisma.faq.findMany({
      where: { businessId },
      orderBy: { displayOrder: "asc" },
    });
  }

  async createFaq(businessId: string, payload: CreateFaqBody) {
    return prisma.faq.create({ data: { businessId, ...payload } });
  }

  async updateFaq(id: string, payload: UpdateFaqBody) {
    return prisma.faq.update({ where: { id }, data: payload });
  }

  async deleteFaq(id: string) {
    return prisma.faq.delete({ where: { id } });
  }

  async reorderFaqs(items: ReorderFaqsBody) {
    const ops = items.map((it) =>
      prisma.faq.update({
        where: { id: it.id },
        data: { displayOrder: it.display_order },
      })
    );
    return prisma.$transaction(ops);
  }
}

const faqsService = new FaqsService();
export default faqsService;

export const listByBusiness = faqsService.listByBusiness.bind(faqsService);
export const createFaq = faqsService.createFaq.bind(faqsService);
export const updateFaq = faqsService.updateFaq.bind(faqsService);
export const deleteFaq = faqsService.deleteFaq.bind(faqsService);
export const reorderFaqs = faqsService.reorderFaqs.bind(faqsService);
