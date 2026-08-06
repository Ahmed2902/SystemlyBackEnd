import { Prisma } from "@prisma/client";

function lockKeys(
  businessId: string,
  date: string,
  staffIds: readonly string[],
) {
  return [...new Set(staffIds)]
    .sort()
    .map((staffId) => `schedule:${businessId}:${date}:${staffId}`);
}

/**
 * Serializes availability checks and appointment writes for each staff/day.
 * The lock is owned by the current PostgreSQL transaction and is released
 * automatically when that transaction commits or rolls back.
 */
export async function lockStaffSchedulingDay(
  tx: Prisma.TransactionClient,
  input: {
    businessId: string;
    date: string;
    staffIds: readonly string[];
  },
): Promise<void> {
  for (const key of lockKeys(input.businessId, input.date, input.staffIds)) {
    await tx.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`,
    );
  }
}
