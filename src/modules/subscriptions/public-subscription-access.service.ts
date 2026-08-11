import { Prisma, SubscriptionStatus } from "@prisma/client";
import { prisma } from "../../shared/db/prisma";
import type { EntitlementKey } from "./subscription.catalog";
import { effectiveSubscriptionStatus } from "./subscription.service";

export const PUBLIC_SITE_UNAVAILABLE_MESSAGE =
  "This website is temporarily unavailable.";

const FULL_PUBLIC_STATUSES = new Set<SubscriptionStatus>([
  SubscriptionStatus.TRIALING,
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.PAST_DUE,
]);

export const publicBusinessGateSelect = {
  id: true,
  slug: true,
  timezone: true,
  isActive: true,
  deletedAt: true,
  updatedAt: true,
  subscription: {
    select: {
      status: true,
      trialEndsAt: true,
      currentPeriodEnd: true,
      graceEndsAt: true,
      plan: {
        select: {
          entitlements: {
            where: { enabled: true },
            select: { key: true },
          },
        },
      },
    },
  },
} satisfies Prisma.BusinessSelect;

export type PublicBusinessGate = Prisma.BusinessGetPayload<{
  select: typeof publicBusinessGateSelect;
}>;

export function publicSiteUnavailableError() {
  const error = new Error(PUBLIC_SITE_UNAVAILABLE_MESSAGE) as Error & {
    statusCode?: number;
    code?: string;
  };
  error.statusCode = 503;
  error.code = "PUBLIC_SITE_UNAVAILABLE";
  return error;
}

export function hasPublicFeature(
  business: PublicBusinessGate,
  entitlement: EntitlementKey,
  now = new Date(),
) {
  if (business.deletedAt || !business.isActive || !business.subscription) {
    return false;
  }

  const status = effectiveSubscriptionStatus(business.subscription, now);
  if (!FULL_PUBLIC_STATUSES.has(status)) return false;

  return business.subscription.plan.entitlements.some(
    (entry) => entry.key === entitlement,
  );
}

export function requirePublicFeature(
  business: PublicBusinessGate,
  entitlement: EntitlementKey,
  now = new Date(),
) {
  if (!hasPublicFeature(business, entitlement, now)) {
    throw publicSiteUnavailableError();
  }
  return business;
}

export function findPublicBusinessGateById(businessId: string) {
  return prisma.business.findUnique({
    where: { id: businessId },
    select: publicBusinessGateSelect,
  });
}

export function findPublicBusinessGateBySlug(slug: string) {
  return prisma.business.findUnique({
    where: { slug },
    select: publicBusinessGateSelect,
  });
}
