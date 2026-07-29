import { prisma } from "../../shared/db/prisma";
import { getBusinessDayRange } from "../../shared/utils/timezone";

const METADATA_TTL_MS = 30_000;
const MAX_METADATA_ENTRIES = 250;
const MAX_METADATA_IN_FLIGHT = 250;
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type CalendarMetadata = Awaited<ReturnType<typeof loadCalendarMetadata>>;
type MetadataEntry = { expiresAt: number; value: CalendarMetadata };

const metadataCache = new Map<string, MetadataEntry>();
const metadataInFlight = new Map<string, Promise<CalendarMetadata>>();

function calendarError(message: string, statusCode: number, code: string) {
  return Object.assign(new Error(message), { statusCode, code });
}

function parseRequestedDate(date: string) {
  if (!DATE_ONLY_PATTERN.test(date)) {
    throw calendarError("Invalid calendar date", 400, "BAD_REQUEST");
  }

  const requestedDate = new Date(`${date}T00:00:00.000Z`);
  if (
    Number.isNaN(requestedDate.getTime()) ||
    requestedDate.toISOString().slice(0, 10) !== date
  ) {
    throw calendarError("Invalid calendar date", 400, "BAD_REQUEST");
  }
  return requestedDate;
}

function cacheKey(businessId: string, date: string) {
  return `${businessId}:${date}`;
}

function storeMetadata(key: string, value: CalendarMetadata) {
  if (metadataCache.size >= MAX_METADATA_ENTRIES && !metadataCache.has(key)) {
    const oldestKey = metadataCache.keys().next().value as string | undefined;
    if (oldestKey) metadataCache.delete(oldestKey);
  }
  metadataCache.set(key, { value, expiresAt: Date.now() + METADATA_TTL_MS });
}

async function loadCalendarMetadata(
  businessId: string,
  requestedDate: Date,
) {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { timezone: true },
  });

  if (!business) {
    throw calendarError("Business not found", 404, "NOT_FOUND");
  }

  const weekday = requestedDate.getUTCDay();
  const [staff, services] = await Promise.all([
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

  return {
    timezone: business.timezone || "UTC",
    requestedDate,
    staff,
    services,
  };
}

async function getCalendarMetadata(
  businessId: string,
  date: string,
  requestedDate: Date,
) {
  const key = cacheKey(businessId, date);
  const cached = metadataCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (cached) metadataCache.delete(key);

  const existing = metadataInFlight.get(key);
  if (existing) return existing;

  // Never bypass this cap: doing so would turn a date-spray attack into
  // unbounded concurrent PostgreSQL work. A short-lived 503 is retryable and
  // protects all tenants sharing this API process.
  if (metadataInFlight.size >= MAX_METADATA_IN_FLIGHT) {
    throw calendarError("Calendar is temporarily busy", 503, "SERVER_BUSY");
  }

  const loading = loadCalendarMetadata(businessId, requestedDate)
    .then((value) => {
      storeMetadata(key, value);
      return value;
    })
    .finally(() => metadataInFlight.delete(key));

  metadataInFlight.set(key, loading);
  return loading;
}

class CalendarQueryService {
  async getWorkspace(businessId: string, date: string) {
    const requestedDate = parseRequestedDate(date);
    const metadata = await getCalendarMetadata(
      businessId,
      date,
      requestedDate,
    );
    const { start, end } = getBusinessDayRange(metadata.timezone, date);

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
        where: { businessId, breakDate: metadata.requestedDate },
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
