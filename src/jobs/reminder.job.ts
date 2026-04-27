import cron from "node-cron";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { prisma } from "../shared/db/prisma";
import redis from "../shared/config/redis";
import { enqueueEmailJob } from "../queues/emailQueue";

dayjs.extend(utc);
dayjs.extend(timezone);

const INTERVAL_MINUTES = 15;

const REMINDER_TTL_EXTRA_SECONDS = 60 * 60; // extra hour to keep key after start

const CONFIRM_KEY = (id: string) => `appt:confirm:${id}`;
const REMIND_KEY = (id: string, when: string) => `appt:remind:${when}:${id}`;

const sendConfirmationFor = async (appt: any) => {
  try {
    if (!appt.customer || !appt.customer.email) return;
    const key = CONFIRM_KEY(appt.id);
    const exists = await redis.get(key);
    if (exists) return;

    // Create durable ReminderLog then enqueue a confirmation job
    const whenKey = "confirm";
    try {
      await prisma.reminderLog.create({
        data: {
          appointmentId: appt.id,
          whenKey,
          channel: "email",
          status: "pending",
        },
      });
    } catch (err: any) {
      if (err?.code === "P2002") return; // already created/processed
      throw err;
    }

    try {
      await enqueueEmailJob("confirmation", {
        appointmentId: appt.id,
        whenKey,
        type: "confirmation",
      });
      // eslint-disable-next-line no-console
      console.log(
        "[ReminderJob] Enqueued confirmation for appointment",
        appt.id
      );
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error(
        "[ReminderJob] Failed to enqueue confirmation",
        appt.id,
        err
      );
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[ReminderJob] Error sending confirmation", err);
  }
};

const sendReminderFor = async (
  appt: any,
  whenLabel: string,
  whenKey: string
) => {
  try {
    if (!appt.customer || !appt.customer.email) return;
    const key = REMIND_KEY(appt.id, whenKey);
    const exists = await redis.get(key);
    if (exists) return;

    // Create durable ReminderLog then enqueue a reminder job
    try {
      await prisma.reminderLog.create({
        data: {
          appointmentId: appt.id,
          whenKey,
          channel: "email",
          status: "pending",
        },
      });
    } catch (err: any) {
      if (err?.code === "P2002") return; // already created
      throw err;
    }

    try {
      await enqueueEmailJob("reminder", {
        appointmentId: appt.id,
        whenKey,
        whenLabel,
        type: "reminder",
      });
      // eslint-disable-next-line no-console
      console.log("[ReminderJob] Enqueued", whenLabel, "reminder for", appt.id);
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error("[ReminderJob] Failed to enqueue reminder", appt.id, err);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[ReminderJob] Error sending reminder", err);
  }
};

const processCycle = async () => {
  try {
    const now = dayjs();

    // 24 hours before reminders (for confirmed appointments)
    const start24 = now.add(24, "hour");
    const end24 = start24.add(INTERVAL_MINUTES, "minute");
    const appts24 = await prisma.appointment.findMany({
      where: {
        status: "confirmed",
        startsAt: { gte: start24.toDate(), lt: end24.toDate() },
      },
      include: { customer: true, business: true, service: true, staff: true },
    });

    await Promise.all(
      appts24.map((a) => sendReminderFor(a, "24 hours before", "24h"))
    );

    // 2 hours before reminders
    const start2 = now.add(2, "hour");
    const end2 = start2.add(INTERVAL_MINUTES, "minute");
    const appts2 = await prisma.appointment.findMany({
      where: {
        status: "confirmed",
        startsAt: { gte: start2.toDate(), lt: end2.toDate() },
      },
      include: { customer: true, business: true, service: true, staff: true },
    });

    await Promise.all(
      appts2.map((a) => sendReminderFor(a, "2 hours before", "2h"))
    );

    // Morning-of confirmations for PENDING appointments
    // Find pending appointments that start within next 24 hours
    const pending = await prisma.appointment.findMany({
      where: {
        status: "pending",
        startsAt: { gte: now.toDate(), lt: now.add(24, "hour").toDate() },
      },
      include: { customer: true, business: true, service: true, staff: true },
    });

    for (const a of pending) {
      try {
        const bizTz = a.business?.timezone || "UTC";
        const bizNow = dayjs().tz(bizTz);
        const apptLocal = dayjs(a.startsAt).tz(bizTz);
        // if it's the same day in business timezone and time is >= 08:00
        if (bizNow.isSame(apptLocal, "day") && bizNow.hour() >= 8) {
          await sendConfirmationFor(a);
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(
          "[ReminderJob] Error processing pending appointment",
          a.id,
          err
        );
      }
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[ReminderJob] Cycle error", err);
  }
};

const register = () => {
  // run immediately then schedule
  void processCycle();
  cron.schedule(
    `*/${INTERVAL_MINUTES} * * * *`,
    () => {
      void processCycle();
    },
    { timezone: "Africa/Cairo" }
  );
  // eslint-disable-next-line no-console
  console.log(
    "[ReminderJob] Registered - runs every",
    INTERVAL_MINUTES,
    "minutes"
  );
};

export default { register };
