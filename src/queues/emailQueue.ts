import crypto from "crypto";
import { prisma } from "../shared/db/prisma";
import { getWorkerUtils } from "./queue";

type EmailJobPayload = {
  type:
    | "welcome"
    | "verification"
    | "password_reset"
    | "appointment"
    | "invoice"
    | "subscription"
    | string;
  to: string | string[];
  data?: Record<string, any>;
  tenantId?: string | number | null;
  idempotencyKey?: string;
};

/**
 * Enqueue a single canonical `send_email` job with structured payload.
 * Preferred API for controllers and services.
 */
export const enqueueSendEmail = async (
  payload: EmailJobPayload,
  opts: { attempts?: number; delay?: number; idempotencyKey?: string } = {},
) => {
  const utils = await getWorkerUtils();

  const keySource =
    payload.idempotencyKey ||
    opts.idempotencyKey ||
    JSON.stringify({
      type: payload.type,
      to: payload.to,
      data: payload.data || {},
      tenantId: payload.tenantId ?? null,
    });

  const jobKey = `email:${crypto
    .createHash("sha256")
    .update(keySource)
    .digest("hex")}`;

  const jobOptions: any = {
    jobKey,
    maxAttempts: opts.attempts ?? 5,
  };

  if (typeof opts.delay === "number") {
    jobOptions.runAt = new Date(Date.now() + opts.delay);
  }

  return utils.addJob("send_email", payload, jobOptions);
};

/**
 * Backwards-compatible wrapper for existing callers using legacy job names.
 * Maps legacy names (confirmation, reminder, staff_invite) to `send_email`.
 */
export const enqueueEmailJob = async (
  name: string,
  data: Record<string, any>,
  opts: Record<string, any> = {},
) => {
  // Direct passthrough if caller already uses canonical job name
  if (name === "send_email") {
    return enqueueSendEmail(data as EmailJobPayload, opts as any);
  }

  // Appointment-related legacy jobs: resolve recipient if only appointmentId provided
  if (name === "confirmation" || name === "reminder") {
    let to = data.to;
    let tenantId = data.tenantId;
    let extraData = { ...data };

    if (!to && data.appointmentId) {
      const appt = await prisma.appointment.findUnique({
        where: { id: data.appointmentId },
        include: {
          customer: true,
          business: true,
          appointmentServices: { include: { service: true } },
          staff: true,
        },
      });
      if (!appt) throw new Error("Appointment not found for email enqueue");
      if (!appt.customer?.email)
        throw new Error("Appointment has no customer email");
      to = appt.customer.email;
      tenantId = (appt as any).businessId ?? appt.business?.id;
      extraData = {
        appointmentId: appt.id,
        name: appt.customer.name,
        businessName: appt.business?.name,
        serviceName: appt.appointmentServices?.[0]?.service?.name ?? null,
        staffName: appt.staff?.name ?? null,
        startsAt: appt.startsAt ? appt.startsAt.toISOString() : undefined,
        whenKey: data.whenKey,
        whenLabel: data.whenLabel,
      };
    }

    const payload: EmailJobPayload = {
      type: "appointment",
      to: to,
      data: {
        subtype: name === "confirmation" ? "confirmation" : "reminder",
        ...extraData,
      },
      tenantId,
      idempotencyKey: data.idempotencyKey,
    };

    return enqueueSendEmail(payload, opts as any);
  }

  if (name === "staff_invite") {
    if (!data.to) throw new Error("Missing 'to' for staff invite email");
    const payload: EmailJobPayload = {
      type: "subscription",
      to: data.to,
      data: { subtype: "staff_invite", ...data },
      tenantId: data.businessId || data.tenantId,
      idempotencyKey: data.idempotencyKey,
    };
    return enqueueSendEmail(payload, opts as any);
  }

  // Generic mapping for common names
  const mapping: Record<string, any> = {
    confirmation: "appointment",
    reminder: "appointment",
    welcome: "welcome",
    verification: "verification",
    password_reset: "password_reset",
    invoice: "invoice",
    subscription: "subscription",
  };

  if (mapping[name]) {
    const payload: EmailJobPayload = {
      type: mapping[name],
      to: data.to || data.email,
      data,
      tenantId: data.businessId || data.tenantId,
      idempotencyKey: (data as any).idempotencyKey,
    };
    return enqueueSendEmail(payload, opts as any);
  }

  // Fallback: keep previous behavior for non-email jobs
  const utils = await getWorkerUtils();
  const jobOptions: any = {};
  if ((opts as any).attempts) jobOptions.maxAttempts = (opts as any).attempts;
  if (typeof (opts as any).delay === "number")
    jobOptions.runAt = new Date(Date.now() + (opts as any).delay);
  return utils.addJob(name, data, jobOptions);
};

export const initEmailQueue = async () => {
  await getWorkerUtils();
  return { init: true };
};
