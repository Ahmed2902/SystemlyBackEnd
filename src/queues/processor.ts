import { Worker, Job } from "bullmq";
import { prisma } from "../shared/db/prisma";
import {
  sendAppointmentConfirmation,
  sendAppointmentReminder,
  sendStaffInviteEmail,
} from "../shared/services/email.service";
import redis, { client as connection } from "../shared/config/redis";

const CONFIRM_KEY = (id: string) => `appt:confirm:${id}`;
const REMIND_KEY = (id: string, when: string) => `appt:remind:${when}:${id}`;

let worker: Worker | null = null;

/**
 * Start worker only if Redis is configured
 */
if (process.env.REDIS_URL) {
  worker = new Worker(
    "emailQueue",
    async (job: Job) => {
      if (job.name === "staff_invite") {
        const { to, inviterName, businessName, acceptUrl } = job.data as any;

        await sendStaffInviteEmail(to, {
          inviterName,
          businessName,
          acceptUrl,
        });

        return;
      }

      const { appointmentId, whenKey, whenLabel, type } = job.data as any;

      const appt = await prisma.appointment.findUnique({
        where: { id: appointmentId },
        include: {
          customer: true,
          business: true,
          service: true,
          staff: true,
        },
      });

      if (!appt) throw new Error("Appointment not found");

      if (!appt.customer?.email) {
        await prisma.reminderLog.updateMany({
          where: {
            appointmentId,
            whenKey,
            status: "pending",
          },
          data: {
            status: "failed",
            errorMessage: "no_customer_email",
          },
        });

        return;
      }

      try {
        if (type === "confirmation") {
          await sendAppointmentConfirmation(appt.customer.email, {
            name: appt.customer.name || "",
            businessName: appt.business?.name || "",
            serviceName: appt.service?.name || "",
            staffName: appt.staff?.name || null,
            startsAt: appt.startsAt.toISOString(),
            cancelUrl: appt.cancelToken
              ? `${
                  process.env.APP_URL || process.env.FRONTEND_URL || ""
                }/api/booking/cancel/${appt.cancelToken}`
              : undefined,
          });

          const seconds =
            Math.max(
              60,
              Math.floor(
                (new Date(appt.startsAt).getTime() - Date.now()) / 1000
              )
            ) + 3600;

          await redis.set(CONFIRM_KEY(appt.id), "1", seconds);

          await prisma.reminderLog.updateMany({
            where: {
              appointmentId,
              whenKey,
              status: "pending",
            },
            data: {
              status: "sent",
              sentAt: new Date(),
            },
          });

          await prisma.appointment.update({
            where: { id: appt.id },
            data: {
              confirmationSent: true,
            },
          });
        } else if (type === "reminder") {
          await sendAppointmentReminder(appt.customer.email, {
            name: appt.customer.name || "",
            businessName: appt.business?.name || "",
            serviceName: appt.service?.name || "",
            staffName: appt.staff?.name || null,
            startsAt: appt.startsAt.toISOString(),
            whenLabel,
          });

          const seconds =
            Math.max(
              60,
              Math.floor(
                (new Date(appt.startsAt).getTime() - Date.now()) / 1000
              )
            ) + 3600;

          await redis.set(REMIND_KEY(appt.id, whenKey), "1", seconds);

          await prisma.reminderLog.updateMany({
            where: {
              appointmentId,
              whenKey,
              status: "pending",
            },
            data: {
              status: "sent",
              sentAt: new Date(),
            },
          });

          await prisma.appointment.update({
            where: { id: appt.id },
            data: {
              reminderSent: true,
            },
          });
        } else {
          throw new Error(`Unknown job type: ${type}`);
        }
      } catch (err: any) {
        await prisma.reminderLog.updateMany({
          where: {
            appointmentId,
            whenKey,
            status: "pending",
          },
          data: {
            status: "failed",
            errorMessage: String(err),
          },
        });

        throw err;
      }
    },
    {
      connection,
      concurrency: 5,
    }
  );

  worker.on("completed", (job) => {
    console.log("[Queue] Job completed:", job.id, job.name);
  });

  worker.on("failed", (job, err) => {
    console.error("[Queue] Job failed:", job?.id, job?.name, String(err));
  });

  console.log("BullMQ worker started");
} else {
  console.warn("REDIS_URL missing. Queue worker disabled.");
}

export default worker;
