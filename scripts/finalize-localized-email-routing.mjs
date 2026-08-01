import fs from "node:fs";

const file = "src/shared/services/email.service.ts";
let source = fs.readFileSync(file, "utf8");

const oldAppointment = `export const makeAppointmentPayload = (
  to: string,
  payload: Record<string, any>,
  subtype: "confirmation" | "reminder",
) => ({
  type: "appointment",
  to,
  data: {
    ...payload,
    subtype,
    locale: normalizeEmailLocale(payload.locale ?? payload.businessLanguage),
  },
  tenantId: payload.businessId || payload.tenantId,
  idempotencyKey: payload.idempotencyKey,
});`;

const newAppointment = `export const makeAppointmentPayload = (
  to: string,
  payload: Record<string, any>,
  subtype: "confirmation" | "reminder",
) => {
  const requestedLocale = payload.locale ?? payload.businessLanguage;
  return {
    type: "appointment",
    to,
    data: {
      ...payload,
      subtype,
      ...(requestedLocale
        ? { locale: normalizeEmailLocale(requestedLocale) }
        : {}),
    },
    tenantId: payload.businessId || payload.tenantId,
    idempotencyKey: payload.idempotencyKey,
  };
};`;

if (source.includes(oldAppointment)) {
  source = source.replace(oldAppointment, newAppointment);
} else if (!source.includes("const requestedLocale = payload.locale ?? payload.businessLanguage")) {
  throw new Error("Appointment locale routing pattern not found");
}

const oldInvite = `export const enqueueStaffInviteEmail = async (
  to: string,
  payload: Record<string, any>,
  opts: any = {},
) => enqueueSendEmail(makeStaffInvitePayload(to, payload), opts);`;

const newInvite = `export const enqueueStaffInviteEmail = async (
  to: string,
  payload: Record<string, any>,
  opts: any = {},
) => {
  let preferredLanguage =
    payload.locale ?? payload.preferredLanguage ?? payload.businessLanguage;
  const businessId = payload.businessId ?? payload.tenantId;

  if (!preferredLanguage && businessId) {
    const owner = await prisma.businessUser.findFirst({
      where: {
        businessId,
        role: { in: ["BusinessAdmin", "SuperAdmin"] },
      },
      orderBy: { createdAt: "asc" },
      select: { preferredLanguage: true },
    });
    preferredLanguage = owner?.preferredLanguage;
  }

  return enqueueSendEmail(
    makeStaffInvitePayload(to, { ...payload, preferredLanguage }),
    opts,
  );
};`;

if (source.includes(oldInvite)) {
  source = source.replace(oldInvite, newInvite);
} else if (!source.includes("let preferredLanguage =\n    payload.locale")) {
  throw new Error("Staff invitation locale routing pattern not found");
}

fs.writeFileSync(file, source);
console.log(`updated ${file}`);
