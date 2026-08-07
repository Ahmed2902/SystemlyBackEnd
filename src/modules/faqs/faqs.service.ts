import { prisma } from "../../shared/db/prisma";
import type {
  CreateFaqBody,
  ReorderFaqsBody,
  UpdateFaqBody,
} from "./faqs.schema";

function notFound() {
  const error = new Error("FAQ not found") as Error & {
    statusCode?: number;
    code?: string;
  };
  error.statusCode = 404;
  error.code = "NOT_FOUND";
  return error;
}

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

  async updateFaq(
    businessId: string,
    id: string,
    payload: UpdateFaqBody,
  ) {
    const updated = await prisma.faq.updateMany({
      where: { id, businessId },
      data: payload,
    });
    if (updated.count !== 1) throw notFound();
    return prisma.faq.findFirstOrThrow({ where: { id, businessId } });
  }

  async deleteFaq(businessId: string, id: string) {
    const deleted = await prisma.faq.deleteMany({ where: { id, businessId } });
    if (deleted.count !== 1) throw notFound();
    return { id, deleted: true };
  }

  async reorderFaqs(businessId: string, items: ReorderFaqsBody) {
    const ids = [...new Set(items.map((item) => item.id))];
    const ownedCount = await prisma.faq.count({
      where: { businessId, id: { in: ids } },
    });
    if (ownedCount !== ids.length) throw notFound();

    await prisma.$transaction(
      items.map((item) =>
        prisma.faq.updateMany({
          where: { id: item.id, businessId },
          data: { displayOrder: item.display_order },
        }),
      ),
    );

    return this.listByBusiness(businessId);
  }
}

const faqsService = new FaqsService();
export default faqsService;

export const listByBusiness = faqsService.listByBusiness.bind(faqsService);
export const createFaq = faqsService.createFaq.bind(faqsService);
export const updateFaq = faqsService.updateFaq.bind(faqsService);
export const deleteFaq = faqsService.deleteFaq.bind(faqsService);
export const reorderFaqs = faqsService.reorderFaqs.bind(faqsService);
