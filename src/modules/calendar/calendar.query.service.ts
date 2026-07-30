import { prisma } from "../../shared/db/prisma";
import { getBusinessDayRange } from "../../shared/utils/timezone";

const METADATA_TTL_MS = 30_000;
const TIMEZONE_TTL_MS = 5 * 60_000;
const MAX_METADATA_ENTRIES = 250;
const MAX_METADATA_IN_FLIGHT = 250;
const MAX_TIMEZONE_ENTRIES = 250;
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type CalendarMetadata = Awaited<ReturnType<typeof loadCalendarMetadata>>;
type MetadataEntry = { expiresAt: number; value: CalendarMetadata };
type TimezoneEntry = { expiresAt: number; value: string };

const metadataCache = new Map<string, MetadataEntry>();
const metadataInFlight = new Map<string, Promise<CalendarMetadata>>();
const timezoneCache = new Map<string, TimezoneEntry>();
const timezoneInFlight = new Map<string, Promise<string>>();

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

function metadataKey(businessId: string, date: string) {
  return `${businessId}:${date}`;
}

function evictOldest<T>(cache: Map<string, T>, maximum: number) {
  if (cache.size < maximum) return;
  const oldestKey = cache.keys().next().value as string | undefined;
  if (oldestKey) cache.delete(oldestKey);
}

function storeMetadata(key: string, value: CalendarMetadata) {
  if (!metadataCache.has(key)) evictOldest(metadataCache, MAX_METADATA_ENTRIES);
  metadataCache.set(key, { value, expiresAt: Date.now() + METADATA_TTL_MS });
}

function storeTimezone(businessId: string, value: string) {
  if (!timezoneCache.has(businessId)) {
    evictOldest(timezoneCache, MAX_TIMEZONE_ENTRIES);
  }
  timezoneCache.set(businessId, {
    value,
    expiresAt: Date.now() + TIMEZONE_TTL_MS,
  });
}

async function loadBusinessTimezone(businessId: string) {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { timezone: true },
  });
  if (!business) throw calendarError("Business not found", 404, "NOT_FOUND");
  return business.timezone || "UTC";
}

export async function getCachedBusinessTimezone(businessId: string) {
  const cached = timezoneCache.get(businessId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (cached) timezoneCache.delete(businessId);

  const existing = timezoneInFlight.get(businessId);
  if (existing) return existing;

  const loading = loadBusinessTimezone(businessId)
    .then((value) => {
      storeTimezone(businessId, value);
      return value;
    })
    .finally(() => timezoneInFlight.delete(businessId));
  timezoneInFlight.set(businessId, loading);
  return loading;
}

async function loadCalendarMetadata(
  businessId: string,
  requestedDate: Date,
) {
  const weekday = requestedDate.getUTCDay();
  const [staff, services] = await Promise.all([
    prisma.staff.findMany({
      relationLoadStrategy: "join",
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

  return { requestedDate, staff, services };
}

async function getCalendarMetadata(
  businessId: string,
  date: string,
  requestedDate: Date,
) {
  const key = metadataKey(businessId, date);
  const cached = metadataCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (cached) metadataCache.delete(key);

  const existing = metadataInFlight.get(key);
  if (existing) return existing;

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
    const timezone = await getCachedBusinessTimezone(businessId);
    const { start, end } = getBusinessDayRange(timezone, date);

    // Once the stable timezone is known, all date-specific reads are independent.
    // Running them together removes the previous metadata -> live-data waterfall.
    const [metadata, appointments, breaks] = await Promise.all([
      getCalendarMetadata(businessId, date, requestedDate),
      prisma.appointment.findMany({
        relationLoadStrategy: "join",
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
          discountCents: true,
          customerId: true,
          customer: {
            select: { id: true, name: true },
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
          invoices: {
            where: { status: { not: "voided" } },
            orderBy: { issuedAt: "desc" },
            take: 1,
            select: { status: true },
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
      timezone,
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
