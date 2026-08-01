import { Roles, SubscriptionStatus } from "@prisma/client";
import { prisma } from "../../shared/db/prisma";
import type { EntitlementKey } from "./subscription.catalog";
import { effectiveSubscriptionStatus } from "./subscription.service";

export const SUBSCRIPTION_ACCESS_MODES = {
  FULL: "FULL",
  OWNER_READ_ONLY: "OWNER_READ_ONLY",
  BLOCKED: "BLOCKED",
} as const;

export type SubscriptionAccessMode =
  (typeof SUBSCRIPTION_ACCESS_MODES)[keyof typeof SUBSCRIPTION_ACCESS_MODES];

export interface SubscriptionAccessSnapshot {
  businessId: string;
  mode: SubscriptionAccessMode;
  status: SubscriptionStatus | null;
  effectiveStatus: SubscriptionStatus | null;
  planCode: string | null;
  entitlements: string[];
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  graceEndsAt: Date | null;
  cancelAtPeriodEnd: boolean;
  businessDeleted: boolean;
}

interface AccessDecisionInput {
  businessId: string;
  role?: string | null;
  deletedAt?: Date | null;
  subscription?: {
    status: SubscriptionStatus;
    trialEndsAt: Date | null;
    currentPeriodEnd: Date | null;
    graceEndsAt: Date | null;
    cancelAtPeriodEnd: boolean;
    plan: {
      code: string;
      entitlements: Array<{ key: string }>;
    };
  } | null;
}

function isOwner(role?: string | null) {
  return role === Roles.BusinessAdmin || role === Roles.SuperAdmin;
}

function isFullStatus(status: SubscriptionStatus) {
  return (
    status === SubscriptionStatus.TRIALING ||
    status === SubscriptionStatus.ACTIVE ||
    status === SubscriptionStatus.PAST_DUE
  );
}

export function deriveSubscriptionAccess(
  input: AccessDecisionInput,
  now = new Date(),
): SubscriptionAccessSnapshot {
  const subscription = input.subscription ?? null;
  const effectiveStatus = subscription
    ? effectiveSubscriptionStatus(subscription, now)
    : null;
  const businessDeleted = Boolean(input.deletedAt);

  let mode: SubscriptionAccessMode;
  if (input.role === Roles.SuperAdmin) {
    mode = SUBSCRIPTION_ACCESS_MODES.FULL;
  } else if (businessDeleted) {
    mode = SUBSCRIPTION_ACCESS_MODES.BLOCKED;
  } else if (effectiveStatus && isFullStatus(effectiveStatus)) {
    mode = SUBSCRIPTION_ACCESS_MODES.FULL;
  } else if (isOwner(input.role)) {
    mode = SUBSCRIPTION_ACCESS_MODES.OWNER_READ_ONLY;
  } else {
    mode = SUBSCRIPTION_ACCESS_MODES.BLOCKED;
  }

  return {
    businessId: input.businessId,
    mode,
    status: subscription?.status ?? null,
    effectiveStatus,
    planCode: subscription?.plan.code ?? null,
    entitlements:
      subscription?.plan.entitlements.map((entry) => entry.key).sort() ?? [],
    trialEndsAt: subscription?.trialEndsAt ?? null,
    currentPeriodEnd: subscription?.currentPeriodEnd ?? null,
    graceEndsAt: subscription?.graceEndsAt ?? null,
    cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd ?? false,
    businessDeleted,
  };
}

export async function resolveSubscriptionAccess(
  businessId: string,
  role?: string | null,
  now = new Date(),
) {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      id: true,
      deletedAt: true,
      subscription: {
        select: {
          status: true,
          trialEndsAt: true,
          currentPeriodEnd: true,
          graceEndsAt: true,
          cancelAtPeriodEnd: true,
          plan: {
            select: {
              code: true,
              entitlements: {
                where: { enabled: true },
                select: { key: true },
              },
            },
          },
        },
      },
    },
  });

  if (!business) {
    return deriveSubscriptionAccess({
      businessId,
      role,
      deletedAt: new Date(0),
      subscription: null,
    });
  }

  return deriveSubscriptionAccess(
    {
      businessId: business.id,
      role,
      deletedAt: business.deletedAt,
      subscription: business.subscription,
    },
    now,
  );
}

export function hasEntitlement(
  access: SubscriptionAccessSnapshot,
  entitlement: EntitlementKey,
) {
  return access.entitlements.includes(entitlement);
}
