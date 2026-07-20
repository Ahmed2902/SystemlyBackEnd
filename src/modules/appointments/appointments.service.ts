import { prisma } from "../../shared/db/prisma";
import { Roles, AppointmentStatus } from "@prisma/client";
import type {
  CreateManualAppointmentBody,
  ListAppointmentsQuery,
  CancelAppointmentBody,
  FinishAppointmentInput,
} from "./appointments.schema";
import { getBusinessDayRange } from "../../shared/utils/timezone";
import { isModuleEnabled } from "../../shared/config/verticals.config";
import { createAppointmentCore } from "../../shared/services/scheduling/appointment-core.service";
import {
  getOwnedAppointmentOrThrow,
  assertEditable,
  assertSegmentsDoNotOverlap,
  assertSegmentsAssignable,
  voidInvoiceIfPaid,
  isCancelled,
  notFoundError,
  invalidStateError,
} from "./appointments.helper";

type ListAppointmentsInput = ListAppointmentsQuery & {
  user: Express.Request["user"];
};

const APPOINTMENT_DETAIL_INCLUDE = {
  customer: true,
  appointmentServices: { include: { service: true } },
  staff: true,
  customItems: true,
  invoice: true,
  clinicVisitRecord: true,
} as const;

class AppointmentsService {
  async listAppointments(opts: ListAppointmentsInput) {
    const { user, date, from, to, page = 1, perPage = 20 } = opts;
    const where: any = {};
    let businessTimezone = "UTC";

    if (user.role !== Roles.SuperAdmin.toString()) {
      where.businessId = user.businessId;

      if (user.businessId) {
        const business = await prisma.business.findUnique({
          where: { id: user.businessId },
          select: { timezone: true },
        });
        businessTimezone = business?.timezone || "UTC";
      }
    }

    if (date) {
      const { start: dayStart, end: dayEnd } = getBusinessDayRange(
        businessTimezone,
        date,
      );
      where.AND = [{ startsAt: { lt: dayEnd } }, { endsAt: { gt: dayStart } }];
    } else if (from || to) {
      where.AND = [];
      if (from) where.AND.push({ startsAt: { gte: new Date(from) } });
      if (to) where.AND.push({ endsAt: { lte: new Date(to) } });
    }

    if (user.role === Roles.Staff.toString()) {
      where.appointmentServices = { some: { staffId: user.id } };
    }

    const skip = (page - 1) * perPage;
    const [items, total] = await Promise.all([
      prisma.appointment.findMany({
        where,
        skip,
        take: perPage,
        orderBy: { startsAt: "desc" },
        include: APPOINTMENT_DETAIL_INCLUDE,
      }),
      prisma.appointment.count({ where }),
    ]);

    const masked = items.map((it: any) => {
      const hasOwnSegment = it.appointmentServices.some(
        (seg: any) => seg.staffId === user.id,
      );
      if (
        user.role === Roles.Staff.toString() &&
        !hasOwnSegment &&
        it.customer
      ) {
        return {
          ...it,
          customer: { ...it.customer, phone: undefined, email: undefined },
        };
      }
      return it;
    });

    return { items: masked, total, page, perPage };
  }

  async getAppointmentById(id: string) {
    return prisma.appointment.findUnique({
      where: { id },
      include: APPOINTMENT_DETAIL_INCLUDE,
    });
  }

  async updateAppointment(
    id: string,
    businessId: string,
    payload: {
      segments: Array<{
        id?: string;
        serviceId: string;
        staffId: string;
        startsAt: string;
        endsAt: string;
      }>;
      customItems: Array<{
        id?: string;
        description: string;
        priceCents: number;
      }>;
      discountCents?: number;
      notes?: string;
      clinical?: {
        notes?: string;
        diagnosis?: string;
        prescriptionJson?: Record<string, unknown>;
      };
    },
  ) {
    return prisma.$transaction(async (tx) => {
      const appt = await getOwnedAppointmentOrThrow(tx, id, businessId, {
        appointmentServices: true,
        invoice: true,
        business: true,
      });

      assertEditable(appt);

      assertSegmentsDoNotOverlap(
        payload.segments.map((segment) => ({
          startsAt: new Date(segment.startsAt),
          endsAt: new Date(segment.endsAt),
        })),
      );

      await assertSegmentsAssignable(tx, {
        businessId,
        businessTimezone: appt.business.timezone,
        excludeAppointmentId: id,
        segments: payload.segments.map((s) => ({
          serviceId: s.serviceId,
          staffId: s.staffId,
          startsAt: new Date(s.startsAt),
          endsAt: new Date(s.endsAt),
        })),
      });

      const incomingIds = payload.segments
        .filter((s) => s.id)
        .map((s) => s.id!);
      const existingIds = appt.appointmentServices.map((s) => s.id);
      const toDelete = existingIds.filter((eid) => !incomingIds.includes(eid));

      if (toDelete.length > 0) {
        await tx.appointmentService.deleteMany({
          where: { id: { in: toDelete } },
        });
      }

      const services = await tx.service.findMany({
        where: { id: { in: payload.segments.map((s) => s.serviceId) } },
      });
      const serviceById = new Map(services.map((s) => [s.id, s]));

      for (let i = 0; i < payload.segments.length; i++) {
        const seg = payload.segments[i];
        const svc = serviceById.get(seg.serviceId);
        const durationMin = svc
          ? Math.round(
              (new Date(seg.endsAt).getTime() -
                new Date(seg.startsAt).getTime()) /
                60000,
            )
          : 0;

        if (seg.id) {
          await tx.appointmentService.update({
            where: { id: seg.id },
            data: {
              serviceId: seg.serviceId,
              staffId: seg.staffId,
              startsAt: new Date(seg.startsAt),
              endsAt: new Date(seg.endsAt),
              order: i,
              durationMinSnapshot: durationMin,
            },
          });
        } else {
          await tx.appointmentService.create({
            data: {
              appointmentId: id,
              serviceId: seg.serviceId,
              staffId: seg.staffId,
              startsAt: new Date(seg.startsAt),
              endsAt: new Date(seg.endsAt),
              order: i,
              durationMinSnapshot: durationMin,
              priceEgpSnapshot: svc?.priceEgp ?? 0,
            },
          });
        }
      }

      await tx.appointmentCustomItem.deleteMany({
        where: { appointmentId: id },
      });
      if (payload.customItems.length > 0) {
        await tx.appointmentCustomItem.createMany({
          data: payload.customItems.map((c) => ({
            appointmentId: id,
            description: c.description,
            priceCents: c.priceCents,
          })),
        });
      }

      if (payload.clinical) {
        await tx.clinicVisitRecord.upsert({
          where: { appointmentId: id },
          create: {
            appointmentId: id,
            notes: payload.clinical.notes,
            diagnosis: payload.clinical.diagnosis,
            prescriptionJson: payload.clinical.prescriptionJson as any,
          },
          update: {
            notes: payload.clinical.notes,
            diagnosis: payload.clinical.diagnosis,
            prescriptionJson: payload.clinical.prescriptionJson as any,
          },
        });
      }

      const sortedSegments = payload.segments
        .slice()
        .sort(
          (a, b) =>
            new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
        );

      return tx.appointment.update({
        where: { id },
        data: {
          discountCents: payload.discountCents ?? 0,
          notes: payload.notes,
          startsAt: new Date(sortedSegments[0].startsAt),
          endsAt: new Date(sortedSegments[sortedSegments.length - 1].endsAt),
        },
        include: APPOINTMENT_DETAIL_INCLUDE,
      });
    });
  }

  async updateStatus(
    id: string,
    status: "pending" | "confirmed" | "no_show",
    businessId: string,
  ) {
    return prisma.$transaction(async (tx) => {
      const appt = await getOwnedAppointmentOrThrow(tx, id, businessId, {
        customer: true,
        invoice: true,
      });
      assertEditable(appt);

      if (appt.status === status) return appt;

      if (appt.status === AppointmentStatus.no_show && appt.customerId) {
        await tx.customer.update({
          where: { id: appt.customerId },
          data: { noShowCount: { decrement: 1 } },
        });
      }
      if (status === AppointmentStatus.no_show && appt.customerId) {
        await tx.customer.update({
          where: { id: appt.customerId },
          data: { noShowCount: { increment: 1 } },
        });
      }

      return tx.appointment.update({
        where: { id },
        data: { status },
      });
    });
  }

  async updateNotes(id: string, notes?: string) {
    return prisma.appointment.update({ where: { id }, data: { notes } });
  }

  async createManualAppointment(
    payload: CreateManualAppointmentBody,
    businessId: string,
  ) {
    // ctx.businessId should come from the authenticated session, not the payload,
    // to avoid the cross-business bug you fixed in rescheduleAppointment
    const { services: selections, startsAt } = payload;

    const business = await prisma.business.findUnique({
      where: { id: businessId },
    });
    if (!business) throw notFoundError("Business not found");

    return prisma.$transaction((tx) =>
      createAppointmentCore(tx, business, {
        businessId,
        selections,
        startsAt,
        customerName: payload.customerName,
        customerPhone: payload.customerPhone,
        notes: payload.notes,
        acquisitionSource: payload.acquisitionSource,
        status: "confirmed",
        generateToken: false,
      }),
    );
  }

  async rescheduleAppointment(
    id: string,
    businessId: string,
    startsAt: string,
  ) {
    return prisma.$transaction(async (tx) => {
      const appt = await getOwnedAppointmentOrThrow(tx, id, businessId, {
        appointmentServices: { orderBy: { order: "asc" } },
        business: true,
      });

      if (appt.appointmentServices.length === 0) {
        throw notFoundError("Appointment has no services");
      }

      let segmentStart = new Date(startsAt);
      const newSegments: {
        id: string;
        staffId: string;
        start: Date;
        end: Date;
      }[] = [];

      for (const seg of appt.appointmentServices) {
        const segEnd = new Date(
          segmentStart.getTime() + seg.durationMinSnapshot * 60 * 1000,
        );
        newSegments.push({
          id: seg.id,
          staffId: seg.staffId,
          start: segmentStart,
          end: segEnd,
        });
        segmentStart = segEnd;
      }

      await assertSegmentsAssignable(tx, {
        businessId,
        businessTimezone: appt.business.timezone,
        excludeAppointmentId: id,
        segments: appt.appointmentServices.map((seg, i) => ({
          serviceId: seg.serviceId,
          staffId: newSegments[i].staffId,
          startsAt: newSegments[i].start,
          endsAt: newSegments[i].end,
        })),
      });

      await Promise.all(
        newSegments.map((s) =>
          tx.appointmentService.update({
            where: { id: s.id },
            data: { startsAt: s.start, endsAt: s.end },
          }),
        ),
      );

      return tx.appointment.update({
        where: { id },
        data: {
          startsAt: newSegments[0].start,
          endsAt: newSegments[newSegments.length - 1].end,
          reminderSent: false,
          confirmationSent: false,
        },
      });
    });
  }

  async markNoShows(bufferMin = 30) {
    const cutoff = new Date(Date.now() - bufferMin * 60 * 1000);

    const appointments = await prisma.appointment.findMany({
      where: { status: "confirmed", endsAt: { lt: cutoff } },
      select: { id: true, customerId: true },
    });

    if (!appointments.length) {
      console.log("[NoShowJob] No-show job: 0 appointments to process");
      return { count: 0 };
    }

    const ids = appointments.map((a) => a.id);
    const updated = await prisma.appointment.updateMany({
      where: { id: { in: ids } },
      data: { status: AppointmentStatus.no_show },
    });

    const customerCounts = appointments.reduce(
      (acc: Record<string, number>, appt) => {
        if (!appt.customerId) return acc;
        acc[appt.customerId] = (acc[appt.customerId] || 0) + 1;
        return acc;
      },
      {},
    );

    for (const [customerId, count] of Object.entries(customerCounts)) {
      await prisma.customer.update({
        where: { id: customerId },
        data: { noShowCount: { increment: count } },
      });
    }

    console.log(
      `[NoShowJob] No-show job: ${updated.count} appointments marked as no_show`,
    );
    return { count: updated.count };
  }

  async finishAppointment(
    appointmentId: string,
    businessId: string,
    payload: FinishAppointmentInput,
  ) {
    return prisma.$transaction(async (tx) => {
      const appointment = await getOwnedAppointmentOrThrow(
        tx,
        appointmentId,
        businessId,
        {
          business: true,
        },
      );

      if (isCancelled(appointment.status)) {
        throw invalidStateError("Cannot complete a cancelled appointment");
      }

      const updated = await tx.appointment.update({
        where: { id: appointmentId },
        data: { status: AppointmentStatus.completed, notes: payload?.notes },
      });

      if (payload.photos?.length) {
        for (const photo of payload.photos) {
          const photoRow = await tx.photo.create({
            data: {
              businessId,
              url: photo.url,
              publicId: photo.publicId,
              kind: "appointment",
              type: photo.type,
            },
          });
          await tx.appointmentPhoto.create({
            data: { appointmentId, photoId: photoRow.id, type: photo.type },
          });
        }
      }

      if (
        isModuleEnabled(
          appointment.business.vertical ?? "",
          "clinicalRecords",
        ) &&
        payload.clinical
      ) {
        await tx.clinicVisitRecord.upsert({
          where: { appointmentId },
          create: {
            appointmentId,
            notes: payload.clinical.notes,
            diagnosis: payload.clinical.diagnosis,
            prescriptionJson: payload.clinical.prescriptionJson,
          },
          update: {
            notes: payload.clinical.notes,
            diagnosis: payload.clinical.diagnosis,
            prescriptionJson: payload.clinical.prescriptionJson,
          },
        });
      }

      return updated;
    });
  }

  async cancelAppointment(
    id: string,
    businessId: string,
    payload: CancelAppointmentBody,
  ) {
    return prisma.$transaction(async (tx) => {
      const appt = await getOwnedAppointmentOrThrow(tx, id, businessId);

      if (isCancelled(appt.status)) {
        throw invalidStateError(
          "Appointment is already cancelled",
          "ALREADY_CANCELLED",
        );
      }
      if (appt.status === AppointmentStatus.completed) {
        throw invalidStateError("Cannot cancel a completed appointment");
      }

      const updated = await tx.appointment.update({
        where: { id },
        data: {
          status: AppointmentStatus.cancelled_by_business,
          notes: payload.reason
            ? `${appt.notes ? appt.notes + " | " : ""}Cancelled: ${payload.reason}`
            : appt.notes,
        },
      });

      await voidInvoiceIfPaid(tx, id);

      if (appt.customerId && appt.customer && appt.customer.visitCount > 0) {
        await tx.customer.update({
          where: { id: appt.customerId },
          data: { visitCount: { decrement: 1 } },
        });
      }

      return updated;
    });
  }

  async deleteCancelledAppointment(id: string, businessId: string) {
    return prisma.$transaction(async (tx) => {
      const appt = await getOwnedAppointmentOrThrow(tx, id, businessId, {
        customer: true,
      });
      if (!isCancelled(appt.status)) {
        throw invalidStateError(
          "Only cancelled appointments can be permanently deleted",
          "INVALID_STATE",
        );
      }
      await tx.appointment.delete({ where: { id } });
      return { id, deleted: true };
    });
  }

  async uncancelAppointment(id: string, businessId: string) {
    return prisma.$transaction(async (tx) => {
      const appt = await getOwnedAppointmentOrThrow(tx, id, businessId);

      if (!isCancelled(appt.status)) {
        throw invalidStateError("Appointment is not cancelled");
      }

      const updated = await tx.appointment.update({
        where: { id },
        data: { status: AppointmentStatus.confirmed },
      });

      if (appt.customerId) {
        await tx.customer.update({
          where: { id: appt.customerId },
          data: { visitCount: { increment: 1 } },
        });
      }

      return updated;
    });
  }

  async revertAppointment(apptId: string, businessId: string) {
    return prisma.$transaction(async (tx) => {
      const appt = await getOwnedAppointmentOrThrow(tx, apptId, businessId);

      if (isCancelled(appt.status)) {
        throw invalidStateError(
          "Cannot revert a cancelled appointment — it was never completed or paid",
        );
      }

      const wasNoShow = appt.status === AppointmentStatus.no_show;

      if (
        wasNoShow &&
        appt.customerId &&
        appt.customer &&
        appt.customer.noShowCount > 0
      ) {
        await tx.customer.update({
          where: { id: appt.customerId },
          data: { noShowCount: { decrement: 1 } },
        });
      }

      await voidInvoiceIfPaid(tx, apptId);

      const updated = await tx.appointment.update({
        where: { id: apptId },
        data: { status: AppointmentStatus.confirmed },
      });

      return { ...updated, wasNoShow };
    });
  }

  async markNoShowManual(id: string, businessId: string) {
    return prisma.$transaction(async (tx) => {
      const appt = await getOwnedAppointmentOrThrow(tx, id, businessId);

      if (
        appt.status !== AppointmentStatus.confirmed &&
        appt.status !== AppointmentStatus.pending
      ) {
        throw invalidStateError(
          "Only pending or confirmed appointments can be marked no-show",
        );
      }

      const updated = await tx.appointment.update({
        where: { id },
        data: { status: AppointmentStatus.no_show },
      });

      if (appt.customerId) {
        await tx.customer.update({
          where: { id: appt.customerId },
          data: { noShowCount: { increment: 1 } },
        });
      }

      return updated;
    });
  }
}

export default new AppointmentsService();
