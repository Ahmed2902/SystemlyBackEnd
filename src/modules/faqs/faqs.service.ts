import { prisma } from "../../shared/db/prisma";

export const listByBusiness = async (businessId: string) =>
  prisma.faq.findMany({
    where: { businessId },
    orderBy: { displayOrder: "asc" },
  });

export const createFaq = async (businessId: string, payload: any) =>
  prisma.faq.create({ data: { businessId, ...payload } });

export const updateFaq = async (id: string, payload: any) =>
  prisma.faq.update({ where: { id }, data: payload });

export const deleteFaq = async (id: string) =>
  prisma.faq.delete({ where: { id } });

export const reorderFaqs = async (
  items: { id: string; display_order: number }[]
) => {
  const ops = items.map((it) =>
    prisma.faq.update({
      where: { id: it.id },
      data: { displayOrder: it.display_order },
    })
  );
  return prisma.$transaction(ops);
};

export default { listByBusiness, createFaq, updateFaq, deleteFaq, reorderFaqs };
