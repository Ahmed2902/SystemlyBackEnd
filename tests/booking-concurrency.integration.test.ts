import { SubscriptionStatus } from "@prisma/client";
import bookingsService from "../src/modules/bookings/bookings.service";
import { ensureCorePlan } from "../src/modules/subscriptions/subscription.seed";
import { prisma } from "../src/shared/db/prisma";

const BOOKING_DATE = "2030-01-07";
const BUSINESS_TIMEZONE = "UTC";

let businessId: string | null = null;
let serviceId: string;
let staffId: string;

async function createSchedulingFixture() {
  const { plan } = await ensureCorePlan();
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const business = await prisma.business.create({
    data: {
      name: "Concurrent Booking Test",
      slug: `concurrent-booking-${suffix}`,
      vertical: "salon",
      phone: `+201${suffix.slice(-8)}`,
      timezone: BUSINESS_TIMEZONE,
      isActive: true,
      trialUsedAt: new Date(),
    },
  });
  businessId = business.id;

  await prisma.subscription.create({
    data: {
      businessId: business.id,
      planId: plan.id,
      status: SubscriptionStatus.TRIALING,
      trialStartedAt: new Date(),
      trialEndsAt: new Date("2099-01-01T00:00:00.000Z"),
    },
  });

  const staff = await prisma.staff.create({
    data: {
      businessId: business.id,
      name: "Concurrent Staff",
      email: `staff-${suffix}@example.com`,
      isActive: true,
    },
  });
  staffId = staff.id;

  const service = await prisma.service.create({
    data: {
      businessId: business.id,
      name: "Concurrent Service",
      durationMin: 45,
      priceEgp: 100,
      isActive: true,
    },
  });
  serviceId = service.id;

  await prisma.serviceStaff.create({
    data: { serviceId: service.id, staffId: staff.id },
  });
  await prisma.availability.create({
    data: {
      staffId: staff.id,
      dayOfWeek: 1,
      startTime: new Date("1970-01-01T09:00:00.000Z"),
      endTime: new Date("1970-01-01T17:00:00.000Z"),
    },
  });
}

function booking(startsAt: string, customerPhone: string) {
  if (!businessId) throw new Error("Scheduling fixture is not initialized.");
  return bookingsService.createBooking({
    businessId,
    services: [{ serviceId, staffId }],
    startsAt,
    timezone: BUSINESS_TIMEZONE,
    customerName: customerPhone,
    customerPhone,
  });
}

async function deleteSchedulingFixture() {
  const id = businessId;
  businessId = null;
  if (!id) return;

  await prisma.$transaction([
    prisma.appointmentService.deleteMany({
      where: { appointment: { businessId: id } },
    }),
    prisma.appointment.deleteMany({ where: { businessId: id } }),
  ]);
  await prisma.business.delete({ where: { id } });
}

beforeEach(createSchedulingFixture);
afterEach(deleteSchedulingFixture);

describe("booking concurrency", () => {
  test("allows exactly one concurrent booking for the same staff slot", async () => {
    const outcomes = await Promise.allSettled([
      booking(`${BOOKING_DATE}T09:00:00.000Z`, "+201000000001"),
      booking(`${BOOKING_DATE}T09:00:00.000Z`, "+201000000002"),
    ]);

    expect(
      outcomes.filter((outcome) => outcome.status === "fulfilled"),
    ).toHaveLength(1);
    const failure = outcomes.find((outcome) => outcome.status === "rejected");
    expect(failure).toBeDefined();
    if (!failure || failure.status !== "rejected") {
      throw new Error("Expected one booking attempt to be rejected.");
    }
    expect(failure.reason).toMatchObject({ code: "SLOT_TAKEN" });
    expect(
      await prisma.appointment.count({ where: { businessId: businessId! } }),
    ).toBe(1);
  });

  test("allows concurrent non-overlapping bookings for the same staff", async () => {
    const outcomes = await Promise.allSettled([
      booking(`${BOOKING_DATE}T09:00:00.000Z`, "+201000000003"),
      booking(`${BOOKING_DATE}T10:00:00.000Z`, "+201000000004"),
    ]);

    expect(outcomes.every((outcome) => outcome.status === "fulfilled")).toBe(
      true,
    );
    expect(
      await prisma.appointment.count({ where: { businessId: businessId! } }),
    ).toBe(2);
  });
});
