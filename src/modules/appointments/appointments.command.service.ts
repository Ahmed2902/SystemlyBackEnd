import { prisma } from "../../shared/db/prisma";
import {
  Roles,
  AppointmentStatus,
  InvoiceStatus,
  Prisma,
} from "@prisma/client";
import type {
  CreateManualAppointmentBody,
  ListAppointmentsQuery,
  CancelAppointmentBody,
  FinishAppointmentInput,
  UpdateAppointmentInput,
} from "./appointments.schema";
import {
  getBusinessDayRange,
  toUtcFromBusinessTime,
} from "../../shared/utils/timezone";
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
  appointmentServices: { include: { service: true, staff: true } },
  staff: true,
  customItems: true,
  invoices: {
    where: { status: { not: "voided" } },
    orderBy: { issuedAt: "desc" },
    take: 1,
  },
  clinicVisitRecord: true,
  appointmentPhotos: { include: { photo: true } },
} as const;

function withCurrentInvoice<T extends { invoices: unknown[] }>({
  invoices,
  ...appointment
}: T) {
  return { ...appointment, invoice: invoices[0] ?? null };
}

export async function updateAppointmentInTransaction(
  tx: Prisma.TransactionClient,
  id: string,
  businessId: string,
  payload: UpdateAppointmentInput,
) {
  const appt = await getOwnedAppointmentOrThrow(tx, id, businessId, {
    appointmentServices: true,
    invoices: {
      where: { status: { not: InvoiceStatus.voided } },
      orderBy: { issuedAt: "desc" },
      take: 1,
    },
    business: true,
  });

  assertEditable(appt);

  assertSegmentsDoNotOverlap(
    payload.segments.map((segment) => ({
      startsAt: new Date(segment.startsAt),
      endsAt: new Date(segment.endsAt),
    })),
  );

  const existingSegmentById = new Map(
    appt.appointmentServices.map((segment) => [segment.id, segment]),
  );
  await assertSegmentsAssignable(tx, {
    businessId,
    businessTimezone: appt.business.timezone,
    excludeAppointmentId: id,
    segments: payload.segments.map((segment) => {
      const existingSegment = segment.id
        ? existingSegmentById.get(segment.id)
        : undefined;
      return {
        serviceId: segment.serviceId,
        staffId: segment.staffId,
        startsAt: new Date(segment.startsAt),
        endsAt: new Date(segment.endsAt),
        checkEligibility:
          !existingSegment ||
          existingSegment.serviceId !== segment.serviceId ||
          existingSegment.staffId !== segment.staffId,
      };
    }),
  });

  const incomingIds = payload.segments
    .filter((segment) => segment.id)
    .map((segment) => segment.id!);
  const existingIds = appt.appointmentServices.map((segment) => segment.id);
  const toDelete = existingIds.filter(
    (existingId) => !incomingIds.includes(existingId),
  );

  if (toDelete.length > 0) {
    await tx.appointmentService.deleteMany({
      where: { id: { in: toDelete } },
    });
  }

  const services = await tx.service.findMany({
    where: { id: { in: payload.segments.map((segment) => segment.serviceId) } },
  });
  const serviceById = new Map(services.map((service) => [service.id, service]));

  for (let index = 0; index < payload.segments.length; index++) {
    const segment = payload.segments[index];
    const service = serviceById.get(segment.serviceId);
    const durationMin = service
      ? Math.round(
          (new Date(segment.endsAt).getTime() -
            new Date(segment.startsAt).getTime()) /
            60000,
        )
      : 0;

    if (segment.id) {
      await tx.appointmentService.update({
        where: { id: segment.id },
        data: {
          serviceId: segment.serviceId,
          staffId: segment.staffId,
          startsAt: new Date(segment.startsAt),
          endsAt: new Date(segment.endsAt),
          order: index,
          durationMinSnapshot: durationMin,
        },
      });
    } else {
      await tx.appointmentService.create({
        data: {
          appointmentId: id,
          serviceId: segment.serviceId,
          staffId: segment.staffId,
          startsAt: new Date(segment.startsAt),
          endsAt: new Date(segment.endsAt),
          order: index,
          durationMinSnapshot: durationMin,
          priceEgpSnapshot: service?.priceEgp ?? 0,
        },
      });
    }
  }

  await tx.appointmentCustomItem.deleteMany({
    where: { appointmentId: id },
  });
  if (payload.customItems.length > 0) {
    await tx.appointmentCustomItem.createMany({
      data: payload.customItems.map((item) => ({
        appointmentId: id,
        description: item.description,
        quantity: item.quantity,
        priceCents: item.priceCents,
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

  const updated = await tx.appointment.update({
    where: { id },
    data: {
      discountCents: payload.discountCents,
      notes: payload.notes,
      startsAt: new Date(sortedSegments[0].startsAt),
      endsAt: new Date(sortedSegments[sortedSegments.length - 1].endsAt),
    },
    include: APPOINTMENT_DETAIL_INCLUDE,
  });
  return withCurrentInvoice(updated);
}

class AppointmentsCommandService {
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

    const masked = items.map((raw: any) => {
      const it = withCurrentInvoice(raw);
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
    const appointment = await prisma.appointment.findUnique({
      where: { id },
      include: APPOINTMENT_DETAIL_INCLUDE,
    });
    return appointment ? withCurrentInvoice(appointment) : null;
  }

  async updateAppointment(
    id: string,
    businessId: string,
    payload: UpdateAppointmentInput,
  ) {
    return prisma.$transaction((tx) =>
      updateAppointmentInTransaction(tx, id, businessId, payload),
    );
  }

  async updateStatus(
    id: string,
    status: "pending" | "confirmed" | "in_progress" | "no_show",
    businessId: string,
  ) {
    return prisma.$transaction(async (tx) => {
      const appt = await getOwnedAppointmentOrThrow(tx, id, businessId, {
        customer: true,
        invoices: {
          where: { status: { not: InvoiceStatus.voided } },
          orderBy: { issuedAt: "desc" },
          take: 1,
        },
      });
      assertEditable(appt);

      if (appt.status === status) return appt;

      if (
        status === AppointmentStatus.no_show &&
        appt.status === AppointmentStatus.in_progress
      ) {
        throw invalidStateError(
          "An in-progress appointment cannot be marked as no-show",
          "INVALID_APPOINTMENT_STATE",
          409,
        );
      }

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
        bookingChannel: "FRONT_DESK",
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

      let segmentStart = toUtcFromBusinessTime(
        startsAt,
        appt.business.timezone,
      );
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
        newSegments.map((segment) =>
          tx.appointmentService.update({
            where: { id: segment.id },
            data: { startsAt: segment.start, endsAt: segment.end },
          }),
        ),
      );

      return tx.appointment.update({
        where: { id },
        data: {
          startsAt: newSegments[0].start,
          endsAt: newSegments[newSegments.length - 1].end,
        },
      });
    });
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
        { business: true },
      );

      if (appointment.status === AppointmentStatus.completed) {
        return tx.appointment.findUniqueOrThrow({
          where: { id: appointmentId },
        });
      }

      if (
        appointment.status !== AppointmentStatus.pending &&
        appointment.status !== AppointmentStatus.confirmed &&
        appointment.status !== AppointmentStatus.in_progress
      ) {
        throw invalidStateError(
          "This appointment cannot be completed in its current state",
          "INVALID_APPOINTMENT_STATE",
          409,
        );
      }

      const updated = await tx.appointment.update({
        where: { id: appointmentId },
        data: { status: AppointmentStatus.completed, notes: payload?.notes },
      });

      await tx.customer.update({
        where: { id: appointment.customerId },
        data: {
          visitCount: { increment: 1 },
          lastVisitAt: appointment.startsAt,
        },
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
      if (
        appt.status !== AppointmentStatus.pending &&
        appt.status !== AppointmentStatus.confirmed
      ) {
        throw invalidStateError(
          "Only pending or confirmed appointments can be cancelled",
          "INVALID_APPOINTMENT_STATE",
          409,
        );
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

      return tx.appointment.update({
        where: { id },
        data: { status: AppointmentStatus.confirmed },
      });
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
      const wasCompleted = appt.status === AppointmentStatus.completed;

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

      if (wasCompleted && appt.customerId) {
        const latestCompleted = await tx.appointment.findFirst({
          where: {
            businessId,
            customerId: appt.customerId,
            status: AppointmentStatus.completed,
            id: { not: apptId },
          },
          orderBy: { startsAt: "desc" },
          select: { startsAt: true },
        });

        await tx.customer.update({
          where: { id: appt.customerId },
          data: {
            ...(appt.customer && appt.customer.visitCount > 0
              ? { visitCount: { decrement: 1 } }
              : {}),
            lastVisitAt: latestCompleted?.startsAt ?? null,
          },
        });
      }

      return { ...updated, wasNoShow, wasCompleted };
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
          "INVALID_APPOINTMENT_STATE",
          409,
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

export default new AppointmentsCommandService();
