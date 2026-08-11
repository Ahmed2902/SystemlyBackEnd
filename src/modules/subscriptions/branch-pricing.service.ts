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

export function calculateBranchPricing(
  basePriceCents: number,
  activeBranchCount: number,
  currency = "EGP",
): BranchPricingSummary {
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
