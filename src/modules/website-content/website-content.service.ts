import { prisma } from "../../shared/db/prisma";
import { Prisma } from "@prisma/client";
import type { WebsiteContentInput } from "./website-content.schema";

export const getByBusinessId = async (businessId: string) => {
  const content = await prisma.websiteContent.findUnique({
    where: { businessId },
  });
  return content;
};

export const upsertByBusinessId = async (
  businessId: string,
  payload: WebsiteContentInput
) => {
  const { sectionOrder, ...rest } = payload;
  const data: Prisma.WebsiteContentUpdateInput = {
    ...rest,
    ...(sectionOrder !== undefined
      ? { sectionOrder: sectionOrder as Prisma.InputJsonValue }
      : {}),
  };

  const existing = await prisma.websiteContent.findUnique({
    where: { businessId },
  });
  if (existing) {
    return prisma.websiteContent.update({
      where: { businessId },
      data,
    });
  }
  const createData: Prisma.WebsiteContentUncheckedCreateInput = {
    businessId,
    ...rest,
    ...(sectionOrder !== undefined
      ? { sectionOrder: sectionOrder as Prisma.InputJsonValue }
      : {}),
  };
  return prisma.websiteContent.create({ data: createData });
};

export default { getByBusinessId, upsertByBusinessId };
