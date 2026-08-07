import {
  AppointmentStatus,
  Roles,
  SubscriptionStatus,
} from "@prisma/client";
import { DateTime } from "luxon";
import appointmentsCommandService from "../src/modules/appointments/appointments.command.service";
import bookingsService from "../src/modules/bookings/bookings.service";
import onboardingService from "../src/modules/onboarding/onboarding.service";
import type { CompleteOnboardingInput } from "../src/modules/onboarding/onboarding.schema";
import { ensureCorePlan } from "../src/modules/subscriptions/subscription.seed";
import { prisma } from "../src/shared/db/prisma";

const createdBusinessIds: string[] = [];
const createdUserIds: string[] = [];

async function createBusinessFixture(timezone = "Africa/Cairo") {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const business = await prisma.business.create({
    data: {
      name: "Booking Correctness Test",
      slug: `booking-correctness-${suffix}`,
      vertical: "salon",
      phone: `+201${suffix.replace(/\D/g, "").slice(-8).padStart(8, "0")}`,
      timezone,
      isActive: true,
      trialUsedAt: new Date(),
    },
  });
  createdBusinessIds.push(business.id);
  return business;
}

async function enablePublicBooking(businessId: string) {
  const { plan } = await ensureCorePlan();
  await prisma.subscription.create({
    data: {
      businessId,
      planId: plan.id,
      status: SubscriptionStatus.TRIALING,
      trialStartedAt: new Date(),
      trialEndsAt: new Date("2099-01-01T00:00:00.000Z"),
    },
  });
}

async function createAppointmentFixture(status: AppointmentStatus) {
  const business = await createBusinessFixture();
  const staff = await prisma.staff.create({
    data: {
      businessId: business.id,
      name: "Lifecycle Staff",
      isActive: true,
    },
  });
  const customer = await prisma.customer.create({
    data: {
      businessId: business.id,
      name: "Lifecycle Customer",
      phone: `+201${Math.floor(Math.random() * 1_000_000_000)
        .toString()
        .padStart(9, "0")}`,
      visitCount: 3,
      lastVisitAt: new Date("2029-12-01T10:00:00.000Z"),
    },
  });
  const appointment = await prisma.appointment.create({
    data: {
      businessId: business.id,
      staffId: staff.id,
      customerId: customer.id,
      startsAt: new Date("2030-01-07T10:00:00.000Z"),
      endsAt: new Date("2030-01-07T10:30:00.000Z"),
      status,
    },
  });
  return { business, staff, customer, appointment };
}

function onboardingInput(slug: string): CompleteOnboardingInput {
  return {
    vertical: "salon",
    templateId: "aura-wellness",
    name: `Onboarding ${slug}`,
    slug,
    phone: "+201000000000",
    timezone: "Africa/Cairo",
    language: "en",
    primaryColor: "#111111",
    sectionOrder: ["services", "team"],
    showTeam: true,
    showFaq: true,
    services: [
      {
        clientId: "service-1",
        name: "Haircut",
        priceEgp: 100,
        durationMin: 30,
      },
    ],
    staff: [
      {
        clientId: "staff-1",
        name: "Stylist",
        role: "Staff",
        serviceClientIds: ["service-1"],
        availability: [
          { dayOfWeek: 1, startTime: "09:00", endTime: "17:00" },
        ],
      },
    ],
    faqs: [],
    galleryPhotoUrls: [],
  };
}

afterEach(async () => {
  if (createdBusinessIds.length > 0) {
    const businessIds = createdBusinessIds.splice(0);
    await prisma.appointmentService.deleteMany({
      where: { appointment: { businessId: { in: businessIds } } },
    });
    await prisma.appointment.deleteMany({
      where: { businessId: { in: businessIds } },
    });
    await prisma.business.deleteMany({
      where: { id: { in: businessIds } },
    });
  }
  if (createdUserIds.length > 0) {
    await prisma.businessUser.deleteMany({
      where: { id: { in: createdUserIds.splice(0) } },
    });
  }
});

describe("booking lifecycle correctness", () => {
  test("customer cancellation is idempotent and never changes visitCount", async () => {
    const { customer, appointment } = await createAppointmentFixture(
      AppointmentStatus.confirmed,
    );

    const first = await bookingsService.cancelByToken(appointment.cancelToken);
    const second = await bookingsService.cancelByToken(appointment.cancelToken);
    const reloadedCustomer = await prisma.customer.findUniqueOrThrow({
      where: { id: customer.id },
    });

    expect(first.status).toBe(AppointmentStatus.cancelled_by_customer);
    expect(second.status).toBe(AppointmentStatus.cancelled_by_customer);
    expect(reloadedCustomer.visitCount).toBe(3);
  });

  test.each([
    AppointmentStatus.in_progress,
    AppointmentStatus.completed,
    AppointmentStatus.no_show,
  ])("customer cannot cancel an appointment in %s", async (status) => {
    const { appointment, customer } = await createAppointmentFixture(status);

    await expect(
      bookingsService.cancelByToken(appointment.cancelToken),
    ).rejects.toMatchObject({ code: "INVALID_APPOINTMENT_STATE", statusCode: 409 });

    const reloadedCustomer = await prisma.customer.findUniqueOrThrow({
      where: { id: customer.id },
    });
    expect(reloadedCustomer.visitCount).toBe(3);
  });

  test("visitCount changes exactly once on completion and completed revert", async () => {
    const { business, staff, customer, appointment } =
      await createAppointmentFixture(AppointmentStatus.confirmed);

    await prisma.appointment.create({
      data: {
        businessId: business.id,
        staffId: staff.id,
        customerId: customer.id,
        startsAt: new Date("2029-12-01T10:00:00.000Z"),
        endsAt: new Date("2029-12-01T10:30:00.000Z"),
        status: AppointmentStatus.completed,
      },
    });

    await appointmentsCommandService.finishAppointment(
      appointment.id,
      business.id,
      {},
    );
    await appointmentsCommandService.finishAppointment(
      appointment.id,
      business.id,
      {},
    );

    let reloadedCustomer = await prisma.customer.findUniqueOrThrow({
      where: { id: customer.id },
    });
    expect(reloadedCustomer.visitCount).toBe(4);
    expect(reloadedCustomer.lastVisitAt?.toISOString()).toBe(
      appointment.startsAt.toISOString(),
    );

    await appointmentsCommandService.revertAppointment(
      appointment.id,
      business.id,
    );

    reloadedCustomer = await prisma.customer.findUniqueOrThrow({
      where: { id: customer.id },
    });
    expect(reloadedCustomer.visitCount).toBe(3);
    expect(reloadedCustomer.lastVisitAt?.toISOString()).toBe(
      "2029-12-01T10:00:00.000Z",
    );
  });

  test("uncancelling does not count a visit", async () => {
    const { business, customer, appointment } = await createAppointmentFixture(
      AppointmentStatus.cancelled_by_business,
    );

    await appointmentsCommandService.uncancelAppointment(
      appointment.id,
      business.id,
    );

    const reloadedCustomer = await prisma.customer.findUniqueOrThrow({
      where: { id: customer.id },
    });
    expect(reloadedCustomer.visitCount).toBe(3);
  });
});

describe("business timezone scheduling", () => {
  test("interprets local booking time in the business timezone and persists the UTC instant", async () => {
    const business = await createBusinessFixture("Africa/Cairo");
    await enablePublicBooking(business.id);

    const staff = await prisma.staff.create({
      data: { businessId: business.id, name: "Cairo Staff", isActive: true },
    });
    const service = await prisma.service.create({
      data: {
        businessId: business.id,
        name: "Cairo Service",
        durationMin: 30,
        priceEgp: 100,
        isActive: true,
      },
    });
    await prisma.serviceStaff.create({
      data: { staffId: staff.id, serviceId: service.id },
    });
    await prisma.availability.create({
      data: {
        staffId: staff.id,
        dayOfWeek: 1,
        startTime: new Date("1970-01-01T09:00:00.000Z"),
        endTime: new Date("1970-01-01T17:00:00.000Z"),
      },
    });

    const result = await bookingsService.createBooking({
      businessId: business.id,
      services: [{ serviceId: service.id, staffId: staff.id }],
      startsAt: "2030-01-07T10:00:00",
      customerName: "Timezone Customer",
      customerPhone: "+201111111111",
    });

    const expectedUtc = DateTime.fromISO("2030-01-07T10:00:00", {
      zone: "Africa/Cairo",
    })
      .toUTC()
      .toJSDate();

    expect(result.appointment.startsAt.toISOString()).toBe(
      expectedUtc.toISOString(),
    );
    expect(result.appointment.status).toBe(AppointmentStatus.confirmed);
  });
});

describe("onboarding concurrency", () => {
  test("a user can create only one business when onboarding requests race", async () => {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const user = await prisma.businessUser.create({
      data: {
        name: "Concurrent Owner",
        email: `concurrent-owner-${suffix}@example.com`,
        passwordHash: "test-password-hash",
        role: Roles.User,
      },
    });
    createdUserIds.push(user.id);

    const slugs = [`onboarding-a-${suffix}`, `onboarding-b-${suffix}`];
    const outcomes = await Promise.allSettled([
      onboardingService.completeOnboarding(user.id, onboardingInput(slugs[0])),
      onboardingService.completeOnboarding(user.id, onboardingInput(slugs[1])),
    ]);

    expect(
      outcomes.filter((outcome) => outcome.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      outcomes.filter((outcome) => outcome.status === "rejected"),
    ).toHaveLength(1);

    const businesses = await prisma.business.findMany({
      where: { slug: { in: slugs } },
      select: { id: true },
    });
    expect(businesses).toHaveLength(1);
    createdBusinessIds.push(...businesses.map((business) => business.id));

    const reloadedUser = await prisma.businessUser.findUniqueOrThrow({
      where: { id: user.id },
      select: { businessId: true },
    });
    expect(reloadedUser.businessId).toBe(businesses[0].id);
  });
});
