import { Worker, Job } from "bullmq";
import IORedis from "ioredis";
import { prisma } from "../shared/db/prisma";
import {
  sendAppointmentConfirmation,
  sendAppointmentReminder,
  sendStaffInviteEmail,
} from "../shared/services/email.service";
import redis from "../shared/config/redis";

const CONFIRM_KEY = (id: string) => `appt:confirm:${id}`;
const REMIND_KEY = (id: string, when: string) => `appt:remind:${when}:${id}`;

let worker: Worker | null = null;

/**
 * Only instantiate the BullMQ Worker when REDIS_URL is explicitly set.
 *
 * We deliberately create a fresh IORedis connection here rather than reusing
 * the shared `client` from redis.ts. When REDIS_URL is absent that client is
 * an in-memory stub — not a real IORedis instance — and BullMQ ignores it,
 * silently falling back to localhost:6379 and crashing the process.
 *
 * Wrapping the entire block in try-catch ensures that even a valid-looking
 * REDIS_URL that turns out to be unreachable at startup won't bring down the
 * rest of the application.
 */
if (!process.env.REDIS_URL) {
  console.warn(
    "[Queue] REDIS_URL is not set — queue worker disabled. " +
      "Email jobs will be skipped until Redis is configured."
  );
} else {
  try {
    const workerConnection = new IORedis(process.env.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });

    workerConnection.on("error", (err: Error) => {
      console.error("[Queue] Redis connection error:", err.message);
    });

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
        connection: workerConnection,
        concurrency: 5,
      }
    );

    worker.on("completed", (job) => {
      console.log("[Queue] Job completed:", job.id, job.name);
    });

    worker.on("failed", (job, err) => {
      console.error("[Queue] Job failed:", job?.id, job?.name, String(err));
    });

    console.log("[Queue] BullMQ worker started successfully.");
  } catch (err: any) {
    console.error(
      "[Queue] Failed to initialise BullMQ worker — queue is disabled. " +
        "The app will continue without background email jobs. Error:",
      err.message
    );
    worker = null;
  }
}

export default worker;
