import { Prisma } from "@prisma/client";

async function advisoryLock(tx: Prisma.TransactionClient, key: string) {
  await tx.$executeRaw(
    Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`,
  );
}

/**
 * Serializes operations that change the active branch set for one business.
 */
export function lockBusinessBranches(
  tx: Prisma.TransactionClient,
  businessId: string,
) {
  return advisoryLock(tx, `branch-set:${businessId}`);
}

/**
 * Serializes appointment creation against activation/deactivation of one branch.
 */
export function lockBranchLifecycle(
  tx: Prisma.TransactionClient,
  businessId: string,
  branchId: string,
) {
  return advisoryLock(tx, `branch-lifecycle:${businessId}:${branchId}`);
}
