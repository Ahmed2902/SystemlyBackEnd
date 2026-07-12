import { DateTime } from "luxon";
import type { Prisma } from "@prisma/client";
import { toUtcFromBusinessTime } from "../../shared/utils/timezone";

export interface ServiceSelection {
  serviceId: string;
  staffId?: string;
}

export interface ScheduledSegment {
  serviceId: string;
  staffId: string;
  start: Date;
  end: Date;
  durationMin: number;
  priceEgp: any;
}

type TxClient = Prisma.TransactionClient;

/**
 * Given an ordered list of service selections and a start time, walks
 * through each service sequentially, finding an eligible + available staff
 * member for that exact segment. Throws SLOT_TAKEN if any segment can't be
 * covered. Used by both the public booking flow and staff-created manual
 * appointments so scheduling behavior stays identical between them.
 */
export async function scheduleServiceSegments(
  tx: TxClient,
  selections: ServiceSelection[],
  startsAt: string,
  tz: string,
): Promise<ScheduledSegment[]> {
  const serviceIds = selections.map((s) => s.serviceId);
  const services = await tx.service.findMany({
    where: { id: { in: serviceIds } },
  });
  if (services.length !== serviceIds.length) {
    const err: any = new Error("One or more services not found");
    err.statusCode = 404;
    throw err;
  }
  const serviceById = new Map(services.map((s) => [s.id, s]));

  let segmentStart = /(?:Z|[+-]\d\d:\d\d)$/.test(startsAt)
    ? DateTime.fromJSDate(new Date(startsAt)).setZone(tz)
    : DateTime.fromJSDate(toUtcFromBusinessTime(startsAt, tz)).setZone(tz);

  const segments: ScheduledSegment[] = [];

  for (const sel of selections) {
    const svc = serviceById.get(sel.serviceId)!;
    const segEnd = segmentStart.plus({ minutes: svc.durationMin });

    const candidateStaffIds = sel.staffId
      ? [sel.staffId]
      : (
          await tx.serviceStaff.findMany({
            where: { serviceId: sel.serviceId },
          })
        ).map((r) => r.staffId);

    let assignedStaff: string | null = null;
    for (const sId of candidateStaffIds) {
      const conflict = await tx.appointmentService.findFirst({
        where: {
          staffId: sId,
          appointment: {
            status: {
              notIn: ["cancelled_by_customer", "cancelled_by_business"],
            },
          },
          AND: [
            { startsAt: { lt: segEnd.toJSDate() } },
            { endsAt: { gt: segmentStart.toJSDate() } },
          ],
        },
      });
      if (!conflict) {
        assignedStaff = sId;
        break;
      }
    }

    if (!assignedStaff) {
      const err: any = new Error(
        "This time slot is no longer available for one of the selected services.",
      );
      err.statusCode = 409;
      err.code = "SLOT_TAKEN";
      throw err;
    }

    segments.push({
      serviceId: sel.serviceId,
      staffId: assignedStaff,
      start: segmentStart.toJSDate(),
      end: segEnd.toJSDate(),
      durationMin: svc.durationMin,
      priceEgp: svc.priceEgp,
    });

    segmentStart = segEnd;
  }

  return segments;
}
