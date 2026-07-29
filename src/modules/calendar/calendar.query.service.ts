import redis from "../../shared/config/redis";
import { prisma } from "../../shared/db/prisma";
import { getBusinessDayRange } from "../../shared/utils/timezone";

const METADATA_CACHE_TTL_SECONDS = 30;
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const calendarError = (message: string, statusCode: number, code: string) =>
  Object.assign(new Error(message), { statusCode, code });

async function loadCalendarMetadata(businessId: string, date: string) {
  const requestedDate = new Date(`${date}T00:00:00.000Z`);
  const weekday = requestedDate.getUTCDay();

  const [business, staff, services] = await Promise.all([
    prisma.business.findUnique({
      where: { id: businessId },
      select: { timezone: true },
    }),
    prisma.staff.findMany({
      where: { businessId, isActive: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        role: true,
        serviceStaff: { select: { serviceId: true } },
        availability: {
          where: { dayOfWeek: weekday },
          orderBy: { startTime: "asc" },
          select: {
            dayOfWeek: true,
            startTime: true,
            endTime: true,
            breakAfterMin: true,
          },
        },
        availabilityOverrides: {
          where: { overrideDate: requestedDate },
          select: {
            id: true,
            overrideDate: true,
            isDayOff: true,
            startTime: true,
            endTime: true,
          },
        },
      },
    }),
    prisma.service.findMany({
      where: { businessId, isActive: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        durationMin: true,
        priceEgp: true,
      },
    }),
  ]);

  if (!business) throw calendarError("Business not found", 404, "NOT_FOUND");

  return {
    timezone: business.timezone || "UTC",
    staff,
    services,
  };
}

type CalendarMetadata = Awaited<ReturnType<typeof loadCalendarMetadata>>;

function isCalendarMetadata(value: unknown): value is CalendarMetadata {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.timezone === "string" &&
    Array.isArray(candidate.staff) &&
    Array.isArray(candidate.services)
  );
}

async function getCalendarMetadata(businessId: string, date: string) {
  const cacheKey = `calendar:metadata:v1:${businessId}:${date}`;

  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      const parsed: unknown = JSON.parse(cached);
      if (isCalendarMetadata(parsed)) return parsed;
    }
  } catch {
    // Redis is an optimisation. Database reads remain the source of truth.
  }

  const metadata = await loadCalendarMetadata(businessId, date);
  try {
    await redis.set(
      cacheKey,
      JSON.stringify(metadata),
      METADATA_CACHE_TTL_SECONDS,
    );
  } catch {
    // Do not fail a workspace request because the optional cache is unavailable.
  }
  return metadata;
}

class CalendarQueryService {
  async getWorkspace(businessId: string, date: string) {
    if (!DATE_ONLY_PATTERN.test(date)) {
      throw calendarError("Invalid calendar date", 400, "BAD_REQUEST");
    }

    const metadata = await getCalendarMetadata(businessId, date);
    const { start, end } = getBusinessDayRange(metadata.timezone, date);
    const requestedDate = new Date(`${date}T00:00:00.000Z`);

    const [appointments, breaks] = await Promise.all([
      prisma.appointment.findMany({
        where: {
          businessId,
          startsAt: { lt: end },
          endsAt: { gt: start },
        },
        orderBy: { startsAt: "asc" },
        select: {
          id: true,
          startsAt: true,
          status: true,
          notes: true,
          discountCents: true,
          customerId: true,
          customer: {
            select: {
              id: true,
              name: true,
              phone: true,
              visitCount: true,
              noShowCount: true,
            },
          },
          appointmentServices: {
            orderBy: { order: "asc" },
            select: {
              id: true,
              serviceId: true,
              staffId: true,
              startsAt: true,
              endsAt: true,
              priceEgpSnapshot: true,
              service: { select: { name: true } },
            },
          },
          customItems: {
            select: {
              id: true,
              description: true,
              quantity: true,
              priceCents: true,
            },
          },
          invoices: {
            where: { status: { not: "voided" } },
            orderBy: { issuedAt: "desc" },
            take: 1,
            select: { status: true },
          },
          clinicVisitRecord: {
            select: {
              notes: true,
              diagnosis: true,
              prescriptionJson: true,
            },
          },
        },
      }),
      prisma.staffBreak.findMany({
        where: { businessId, breakDate: requestedDate },
        orderBy: { startTime: "asc" },
        select: {
          id: true,
          staffId: true,
          startTime: true,
          endTime: true,
          label: true,
        },
      }),
    ]);

    return {
      date,
      timezone: metadata.timezone,
      appointments: appointments.map(({ invoices, ...appointment }) => ({
        ...appointment,
        invoice: invoices[0] ?? null,
      })),
      staff: metadata.staff,
      breaks,
      services: metadata.services,
    };
  }
}

export default new CalendarQueryService();