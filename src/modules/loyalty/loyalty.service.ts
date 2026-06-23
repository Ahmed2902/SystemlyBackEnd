import { prisma } from "../../shared/db/prisma";

// Simple v1: 1 point per EGP spent. Changeable later.
const POINTS_PER_EGP = 1;

class LoyaltyService {
  private async applyInvoicePoints(invoice: {
    id: string;
    customerId?: string | null;
    businessId: string;
    totalCents: number;
    type: "earned" | "refund";
  }) {
    if (!invoice || !invoice.customerId) return null;

    const customerId = invoice.customerId as string;
    const egp = Math.floor(invoice.totalCents / 100);
    const points = egp * POINTS_PER_EGP;
    if (points <= 0) return null;

    return prisma.$transaction(async (tx) => {
      const account = await tx.loyaltyAccount.upsert({
        where: {
          customerId_businessId: { customerId, businessId: invoice.businessId },
        } as any,
        create: {
          customerId,
          businessId: invoice.businessId,
          pointsBalance: 0,
        },
        update: {},
      });

      const delta = invoice.type === "refund" ? -points : points;

      const txn = await tx.loyaltyTransaction.create({
        data: {
          accountId: account.id,
          invoiceId: invoice.id,
          points: delta,
          type: invoice.type,
        },
      });

      await tx.loyaltyAccount.update({
        where: { id: account.id },
        data: {
          pointsBalance: { increment: delta },
        },
      });

      return { account, transaction: txn };
    });
  }

  async creditPointsForInvoice(invoice: {
    id: string;
    customerId?: string | null;
    businessId: string;
    totalCents: number;
  }) {
    return this.applyInvoicePoints({ ...invoice, type: "earned" });
  }

  async reversePointsForInvoice(invoice: {
    id: string;
    customerId?: string | null;
    businessId: string;
    totalCents: number;
  }) {
    return this.applyInvoicePoints({ ...invoice, type: "refund" });
  }

  async getAccount(customerId: string, businessId: string) {
    return prisma.loyaltyAccount.findUnique({
      where: { customerId_businessId: { customerId, businessId } } as any,
      include: { transactions: true },
    });
  }
}

export default new LoyaltyService();
