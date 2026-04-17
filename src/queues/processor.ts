import IORedis from "ioredis";
import { Worker, Job } from "bullmq";
import { prisma } from "../shared/db/prisma";
import {
  sendAppointmentConfirmation,
  sendAppointmentReminder,
} from "../shared/services/email.service";
import redis from "../shared/config/redis";

const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";
const connection = new IORedis(REDIS_URL);

const CONFIRM_KEY = (id: string) => `appt:confirm:${id}`;
const REMIND_KEY = (id: string, when: string) => `appt:remind:${when}:${id}`;

const worker = new Worker(
  "emailQueue",
  async (job: Job) => {
    const { appointmentId, whenKey, whenLabel, type } = job.data as any;

    // fetch appointment with relations
    const appt = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: { customer: true, business: true, service: true, staff: true },
    });
    if (!appt) throw new Error("Appointment not found");

    if (!appt.customer || !appt.customer.email) {
      // update log as failed
      await prisma.reminderLog.updateMany({
        where: { appointmentId, whenKey, status: "pending" },
        data: { status: "failed", errorMessage: "no_customer_email" },
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
            ? `${process.env.APP_URL || process.env.FRONTEND_URL || ""}/api/booking/cancel/${appt.cancelToken}`
            : undefined,
        });

        // set redis key until after appointment
        const seconds =
          Math.max(
            60,
            Math.floor((new Date(appt.startsAt).getTime() - Date.now()) / 1000)
          ) + 60 * 60;
        await redis.set(CONFIRM_KEY(appt.id), "1", seconds);

        // update log and appointment flag
        await prisma.reminderLog.updateMany({
          where: { appointmentId, whenKey, status: "pending" },
          data: { status: "sent", sentAt: new Date() },
        });
        await prisma.appointment.update({
          where: { id: appt.id },
          data: { confirmationSent: true },
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
            Math.floor((new Date(appt.startsAt).getTime() - Date.now()) / 1000)
          ) + 60 * 60;
        await redis.set(REMIND_KEY(appt.id, whenKey), "1", seconds);

        await prisma.reminderLog.updateMany({
          where: { appointmentId, whenKey, status: "pending" },
          data: { status: "sent", sentAt: new Date() },
        });
        await prisma.appointment.update({
          where: { id: appt.id },
          data: { reminderSent: true },
        });
      } else {
        throw new Error(`Unknown job type: ${type}`);
      }
    } catch (err: any) {
      // mark failed on log
      await prisma.reminderLog.updateMany({
        where: { appointmentId, whenKey, status: "pending" },
        data: { status: "failed", errorMessage: String(err) },
      });
      throw err; // let BullMQ handle retries/backoff
    }
  },
  { connection, concurrency: 5 }
);

worker.on("completed", (job) => {
  // eslint-disable-next-line no-console
  console.log("[Queue] Job completed:", job.id, job.name);
});

worker.on("failed", (job, err) => {
  // eslint-disable-next-line no-console
  console.error("[Queue] Job failed:", job?.id, job?.name, String(err));
});

export default worker;
