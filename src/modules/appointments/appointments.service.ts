import { prisma } from "../../shared/db/prisma";
import { Roles, AppointmentStatus, InvoiceStatus } from "@prisma/client";
import type {
  CreateManualAppointmentBody,
  ListAppointmentsQuery,
  CancelAppointmentBody,
} from "./appointments.schema";
import { getBusinessDayRange } from "../../shared/utils/timezone";
import { isModuleEnabled } from "../../shared/config/verticals.config";
import { FinishAppointmentInput } from "./appointments.schema";
import { scheduleServiceSegments } from "../Scheduling/Scheduling.service";

type ListAppointmentsInput = ListAppointmentsQuery & {
  user: Express.Request["user"];
};

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

    // Staff should only see appointments where THEY have a segment
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
        include: { customer: true, appointmentServices: true, staff: true },
      }),
      prisma.appointment.count({ where }),
    ]);

    const masked = items.map((it: any) => {
      const hasOwnSegment = it.appointmentServices.some(
        (seg: any) => seg.staffId === user.id,
      );
      if (user.role === Roles.Staff.toString() && !hasOwnSegment) {
        if (it.customer) {
          const ap = { ...it, customer: { ...it.customer } };
          ap.customer.phone = undefined;
          ap.customer.email = undefined;
          return ap;
        }
      }
      return it;
    });

    return { items: masked, total, page, perPage };
  }

  async getAppointmentById(id: string) {
    return prisma.appointment.findUnique({
      where: { id },
      include: { customer: true, appointmentServices: true, staff: true },
    });
  }

  async updateStatus(id: string, status: string) {
    const validStatuses = Object.values(AppointmentStatus) as string[];
    if (!validStatuses.includes(status)) {
      const err: any = new Error("Invalid status");
      err.statusCode = 400;
      err.code = "INVALID_STATUS";
      throw err;
    }

    const appt = await prisma.appointment.update({
      where: { id },
      data: { status } as any,
    });
    return appt;
  }

  async updateNotes(id: string, notes?: string) {
    const appt = await prisma.appointment.update({
      where: { id },
      data: { notes },
    });
    return appt;
  }

  async createManualAppointment(payload: CreateManualAppointmentBody) {
    const {
      businessId,
      services: selections,
      startsAt,
      customerName,
      customerPhone,
      notes,
      acquisitionSource,
    } = payload;

    const business = await prisma.business.findUnique({
      where: { id: businessId },
    });
    const tz = business?.timezone || "UTC";

    return prisma.$transaction(async (tx) => {
      const segments = await scheduleServiceSegments(
        tx,
        selections,
        startsAt,
        tz,
      );

      const existing = await tx.customer.findUnique({
        where: {
          businessId_phone: { businessId, phone: customerPhone } as any,
        } as any,
      });
      let customer;
      if (existing) {
        customer = await tx.customer.update({
          where: { id: existing.id },
          data: {
            visitCount: { increment: 1 },
            lastVisitAt: new Date(),
            name: customerName || existing.name,
            acquisitionSource,
          } as any,
        });
      } else {
        customer = await tx.customer.create({
          data: {
            businessId,
            phone: customerPhone,
            name: customerName || "",
            visitCount: 1,
            lastVisitAt: new Date(),
            acquisitionSource,
          } as any,
        });
      }

      const appt = await tx.appointment.create({
        data: {
          businessId,
          staffId: segments[0].staffId,
          customerId: customer.id,
          startsAt: segments[0].start,
          endsAt: segments[segments.length - 1].end,
          status: "confirmed",
          notes: notes || null,
        },
      });

      await tx.appointmentService.createMany({
        data: segments.map((s, i) => ({
          appointmentId: appt.id,
          serviceId: s.serviceId,
          staffId: s.staffId,
          order: i,
          startsAt: s.start,
          endsAt: s.end,
          durationMinSnapshot: s.durationMin,
          priceEgpSnapshot: s.priceEgp,
        })),
      });

      return { appointment: appt, customer };
    });
  }

  async rescheduleAppointment(id: string, startsAt: string) {
    return prisma.$transaction(async (tx) => {
      const appt = await tx.appointment.findUnique({
        where: { id },
        include: { appointmentServices: { orderBy: { order: "asc" } } },
      });
      if (!appt) {
        const err: any = new Error("Appointment not found");
        err.statusCode = 404;
        err.code = "NOT_FOUND";
        throw err;
      }
      if (appt.appointmentServices.length === 0) {
        const err: any = new Error("Appointment has no services");
        err.statusCode = 404;
        err.code = "NOT_FOUND";
        throw err;
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

        const conflict = await tx.appointmentService.findFirst({
          where: {
            staffId: seg.staffId,
            appointmentId: { not: id },
            appointment: {
              status: {
                notIn: ["cancelled_by_customer", "cancelled_by_business"],
              },
            },
            AND: [
              { startsAt: { lt: segEnd } },
              { endsAt: { gt: segmentStart } },
            ],
          },
        });

        if (conflict) {
          const err: any = new Error("Slot taken");
          err.statusCode = 409;
          err.code = "SLOT_TAKEN";
          throw err;
        }

        newSegments.push({
          id: seg.id,
          staffId: seg.staffId,
          start: segmentStart,
          end: segEnd,
        });
        segmentStart = segEnd;
      }

      await Promise.all(
        newSegments.map((s) =>
          tx.appointmentService.update({
            where: { id: s.id },
            data: { startsAt: s.start, endsAt: s.end },
          }),
        ),
      );

      const updated = await tx.appointment.update({
        where: { id },
        data: {
          startsAt: newSegments[0].start,
          endsAt: newSegments[newSegments.length - 1].end,
          reminderSent: false,
          confirmationSent: false,
        },
      });

      return updated;
    });
  }

  async markNoShows(bufferMin = 30) {
    const cutoff = new Date(Date.now() - bufferMin * 60 * 1000);

    const appointments = await prisma.appointment.findMany({
      where: {
        status: "confirmed",
        endsAt: { lt: cutoff },
      },
      select: {
        id: true,
        customerId: true,
      },
    });

    if (!appointments || appointments.length === 0) {
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
      {} as Record<string, number>,
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
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId, businessId },
      include: { business: true },
    });

    if (!appointment) {
      const err: any = new Error("Appointment not found");
      err.statusCode = 404;
      err.code = "NOT_FOUND";
      throw err;
    }

    const result = await prisma.$transaction(async (tx) => {
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
            data: {
              appointmentId,
              photoId: photoRow.id,
              type: photo.type,
            },
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

    return result;
  }

  async cancelAppointment(
    id: string,
    businessId: string,
    payload: CancelAppointmentBody,
  ) {
    return prisma.$transaction(async (tx) => {
      const appt = await tx.appointment.findUnique({
        where: { id },
        include: { customer: true },
      });

      if (!appt) {
        const err: any = new Error("Appointment not found");
        err.statusCode = 404;
        err.code = "NOT_FOUND";
        throw err;
      }
      if (appt.businessId !== businessId) {
        const err: any = new Error(
          "Appointment does not belong to this business",
        );
        err.statusCode = 403;
        err.code = "FORBIDDEN";
        throw err;
      }
      if (
        appt.status === AppointmentStatus.cancelled_by_business ||
        appt.status === AppointmentStatus.cancelled_by_customer
      ) {
        const err: any = new Error("Appointment is already cancelled");
        err.statusCode = 400;
        err.code = "ALREADY_CANCELLED";
        throw err;
      }
      if (appt.status === AppointmentStatus.completed) {
        const err: any = new Error("Cannot cancel a completed appointment");
        err.statusCode = 400;
        err.code = "INVALID_STATE";
        throw err;
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

      // cancelAppointment — replace the direct update with:
      const existingInvoice = await tx.invoice.findUnique({
        where: { appointmentId: id },
      });
      if (existingInvoice && existingInvoice.status !== InvoiceStatus.voided) {
        await tx.invoice.update({
          where: { appointmentId: id },
          data: { status: InvoiceStatus.voided, voidedAt: new Date() },
        });
      }

      // Undo the visitCount increment applied at booking time —
      // this appointment never became an actual visit.
      if (appt.customerId && appt.customer && appt.customer.visitCount > 0) {
        await tx.customer.update({
          where: { id: appt.customerId },
          data: { visitCount: { decrement: 1 } },
        });
      }

      return updated;
    });
  }

  async revertAppointment(id: string, businessId: string) {
    return prisma.$transaction(async (tx) => {
      const appt = await tx.appointment.findUnique({
        where: { id },
        include: { customer: true },
      });

      if (!appt) {
        const err: any = new Error("Appointment not found");
        err.statusCode = 404;
        err.code = "NOT_FOUND";
        throw err;
      }
      if (appt.businessId !== businessId) {
        const err: any = new Error(
          "Appointment does not belong to this business",
        );
        err.statusCode = 403;
        err.code = "FORBIDDEN";
        throw err;
      }
      if (
        appt.status === AppointmentStatus.cancelled_by_business ||
        appt.status === AppointmentStatus.cancelled_by_customer
      ) {
        const err: any = new Error(
          "Cannot revert a cancelled appointment — it was never completed or paid",
        );
        err.statusCode = 400;
        err.code = "INVALID_STATE";
        throw err;
      }

      const wasNoShow = appt.status === AppointmentStatus.no_show;

      // Undo the no-show job's side effect — this appointment is being
      // reopened, so it shouldn't still count against the customer.
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

      const existingInvoice = await tx.invoice.findUnique({
        where: { appointmentId: id },
      });
      if (existingInvoice && existingInvoice.status !== InvoiceStatus.voided) {
        await tx.invoice.update({
          where: { appointmentId: id },
          data: { status: InvoiceStatus.voided, voidedAt: new Date() },
        });
      }

      const updated = await tx.appointment.update({
        where: { id },
        data: { status: AppointmentStatus.confirmed },
      });

      return { ...updated, wasNoShow };
    });
  }
}

export default new AppointmentsService();
