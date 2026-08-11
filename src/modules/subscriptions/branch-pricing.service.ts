import { prisma } from "../../shared/db/prisma";

export const INCLUDED_BRANCH_COUNT = 1;
export const ADDITIONAL_BRANCH_PRICE_CENTS = 30_000;

export type BranchPricingSummary = {
  basePriceCents: number;
  includedBranchCount: number;
  activeBranchCount: number;
  additionalBranchCount: number;
  additionalBranchUnitPriceCents: number;
  additionalBranchTotalCents: number;
  nextRenewalAmountCents: number;
  currency: string;
};

export async function getBranchPricingSummary(
  businessId: string,
  basePriceCents: number,
  currency = "EGP",
): Promise<BranchPricingSummary> {
  const activeBranchCount = await prisma.branch.count({
    where: { businessId, isActive: true },
  });
  const additionalBranchCount = Math.max(
    activeBranchCount - INCLUDED_BRANCH_COUNT,
    0,
  );
  const additionalBranchTotalCents =
    additionalBranchCount * ADDITIONAL_BRANCH_PRICE_CENTS;

  return {
    basePriceCents,
    includedBranchCount: INCLUDED_BRANCH_COUNT,
    activeBranchCount,
    additionalBranchCount,
    additionalBranchUnitPriceCents: ADDITIONAL_BRANCH_PRICE_CENTS,
    additionalBranchTotalCents,
    nextRenewalAmountCents: basePriceCents + additionalBranchTotalCents,
    currency: currency.toUpperCase(),
  };
}
