import { prisma } from "../../shared/db/prisma";
import { Prisma } from "@prisma/client";
import type { WebsiteContentInput } from "./website-content.schema";

class WebsiteContentService {
  async getByBusinessId(businessId: string) {
    return prisma.websiteContent.findUnique({ where: { businessId } });
  }

  async upsertByBusinessId(businessId: string, payload: WebsiteContentInput) {
    const { sectionOrder, ...rest } = payload;
    const sectionOrderData =
      sectionOrder !== undefined
        ? { sectionOrder: sectionOrder as Prisma.InputJsonValue }
        : {};

    return prisma.websiteContent.upsert({
      where: { businessId },
      update: {
        ...rest,
        ...sectionOrderData,
      },
      create: {
        businessId,
        ...rest,
        ...sectionOrderData,
      },
    });
  }
}

const websiteContentService = new WebsiteContentService();
export default websiteContentService;

export const getByBusinessId = websiteContentService.getByBusinessId.bind(
  websiteContentService,
);
export const upsertByBusinessId = websiteContentService.upsertByBusinessId.bind(
  websiteContentService,
);
