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
  const eligibleByService: string[][] = [];

  for (const selection of selections) {
    if (selection.staffId) {
      const row = await tx.serviceStaff.findUnique({
        where: {
          serviceId_staffId: {
            serviceId: selection.serviceId,
            staffId: selection.staffId,
          },
          ...(businessId
            ? {
                service: { businessId },
                staff: { businessId },
              }
            : {}),
        },
        include: { staff: { select: { isActive: true } } },
      });

      eligibleByService.push(row?.staff?.isActive ? [selection.staffId] : []);
      continue;
    }

    const rows = await tx.serviceStaff.findMany({
      where: {
        serviceId: selection.serviceId,
        ...(businessId
          ? {
              service: { businessId },
              staff: { businessId },
            }
          : {}),
      },
      include: { staff: { select: { isActive: true } } },
    });

    eligibleByService.push(
      rows.filter((row) => row.staff?.isActive).map((row) => row.staffId),
    );
  }

  return eligibleByService;
}
