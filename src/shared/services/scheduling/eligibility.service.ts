import type { Prisma } from "@prisma/client";
import type { ServiceSelection } from "./types";

interface TxLike {
  serviceStaff: Prisma.TransactionClient["serviceStaff"];
}

export async function resolveEligibleStaffBySelection(
  tx: TxLike,
  selections: ServiceSelection[],
  businessId?: string,
): Promise<string[][]> {
  if (selections.length === 0) return [];

  const serviceIds = [...new Set(selections.map((selection) => selection.serviceId))];
  const rows = await tx.serviceStaff.findMany({
    where: {
      serviceId: { in: serviceIds },
      staff: {
        isActive: true,
        ...(businessId ? { businessId } : {}),
      },
      ...(businessId ? { service: { businessId } } : {}),
    },
    select: { serviceId: true, staffId: true },
  });

  const staffByService = new Map<string, string[]>();
  for (const row of rows) {
    const staffIds = staffByService.get(row.serviceId) ?? [];
    staffIds.push(row.staffId);
    staffByService.set(row.serviceId, staffIds);
  }

  return selections.map((selection) => {
    const eligible = staffByService.get(selection.serviceId) ?? [];
    if (!selection.staffId) return eligible;
    return eligible.includes(selection.staffId) ? [selection.staffId] : [];
  });
}
