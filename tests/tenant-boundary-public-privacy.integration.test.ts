import { CommissionType, Roles, SubscriptionStatus } from "@prisma/client";
import businessService from "../src/modules/business/business.service";
import faqsService from "../src/modules/faqs/faqs.service";
import staffCommandService from "../src/modules/staff/staff.command.service";
import staffQueryService from "../src/modules/staff/staff.query.service";
import { ensureCorePlan } from "../src/modules/subscriptions/subscription.seed";
import { prisma } from "../src/shared/db/prisma";

let businessAId: string;
let businessBId: string;
let businessASlug: string;
let faqBId: string;
let staffBId: string;
let serviceBId: string;
let overrideBId: string;

async function createBusinessFixture(label: string) {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return prisma.business.create({
    data: {
      name: `Tenant ${label}`,
      slug: `tenant-${label.toLowerCase()}-${suffix}`,
      vertical: "salon",
      phone: `+201${suffix.replace(/\D/g, "").slice(-8).padStart(8, "0")}`,
      timezone: "Africa/Cairo",
      isActive: true,
      trialUsedAt: new Date(),
    },
  });
}

beforeEach(async () => {
  const { plan } = await ensureCorePlan();
  const [businessA, businessB] = await Promise.all([
    createBusinessFixture("A"),
    createBusinessFixture("B"),
  ]);
  businessAId = businessA.id;
  businessBId = businessB.id;
  businessASlug = businessA.slug;

  await prisma.subscription.create({
    data: {
      businessId: businessA.id,
      planId: plan.id,
      status: SubscriptionStatus.TRIALING,
      trialStartedAt: new Date(),
      trialEndsAt: new Date("2099-01-01T00:00:00.000Z"),
    },
  });

  const [faqB, staffB, serviceB] = await Promise.all([
    prisma.faq.create({
      data: {
        businessId: businessB.id,
        question: "Private tenant B FAQ",
        answer: "Tenant B only",
      },
    }),
    prisma.staff.create({
      data: {
        businessId: businessB.id,
        name: "Tenant B Staff",
        phone: "+201111111111",
        email: `tenant-b-${Date.now()}@example.com`,
        isActive: true,
      },
    }),
    prisma.service.create({
      data: {
        businessId: businessB.id,
        name: "Tenant B Service",
        durationMin: 30,
        priceEgp: 100,
        isActive: true,
      },
    }),
  ]);
  faqBId = faqB.id;
  staffBId = staffB.id;
  serviceBId = serviceB.id;

  await prisma.serviceStaff.create({
    data: { staffId: staffB.id, serviceId: serviceB.id },
  });
  await prisma.availability.create({
    data: {
      staffId: staffB.id,
      dayOfWeek: 1,
      startTime: new Date("1970-01-01T09:00:00.000Z"),
      endTime: new Date("1970-01-01T17:00:00.000Z"),
    },
  });
  const override = await prisma.availabilityOverride.create({
    data: {
      staffId: staffB.id,
      overrideDate: new Date("2030-01-07T00:00:00.000Z"),
      isDayOff: true,
    },
  });
  overrideBId = override.id;

  await prisma.staff.create({
    data: {
      businessId: businessA.id,
      name: "Public Staff",
      jobTitle: "Stylist",
      phone: "+201222222222",
      email: `private-${Date.now()}@example.com`,
      isActive: true,
    },
  });
  await prisma.photo.createMany({
    data: [
      {
        businessId: businessA.id,
        url: "https://example.com/gallery.jpg",
        kind: "gallery",
        position: 0,
      },
      {
        businessId: businessA.id,
        url: "businesses/private/appointments/secret.jpg",
        kind: "appointment",
        type: "before",
        position: 1,
      },
    ],
  });
});

afterEach(async () => {
  await prisma.business.deleteMany({
    where: { id: { in: [businessAId, businessBId] } },
  });
});

describe("tenant boundary", () => {
  test("blocks cross-tenant business mutation", async () => {
    await expect(
      businessService.updateBusiness(
        businessBId,
        { businessId: businessAId, role: Roles.BusinessAdmin },
        { name: "Compromised" },
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(
      await prisma.business.findUnique({ where: { id: businessBId } }),
    ).toMatchObject({ name: "Tenant B" });
  });

  test("blocks cross-tenant FAQ mutation", async () => {
    await expect(
      faqsService.updateFaq(businessAId, faqBId, { question: "Compromised" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(await prisma.faq.findUnique({ where: { id: faqBId } })).toMatchObject({
      question: "Private tenant B FAQ",
    });
  });

  test("blocks cross-tenant staff configuration reads and writes", async () => {
    await expect(
      staffCommandService.assignService(staffBId, businessAId, {
        serviceId: serviceBId,
        commissionType: CommissionType.NONE,
        commissionAmount: 0,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    await expect(
      staffQueryService.getAvailability(staffBId, businessAId),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(
      await staffQueryService.getServiceStaff(staffBId, serviceBId, businessAId),
    ).toBeNull();

    await expect(
      staffCommandService.deleteOverride(overrideBId, businessAId),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("public business projection", () => {
  test("returns gallery photos and intentional public staff fields only", async () => {
    const business = await businessService.getPublicBySlug(businessASlug);
    expect(business).not.toBeNull();
    expect(business?.photos).toEqual([
      expect.objectContaining({
        url: "https://example.com/gallery.jpg",
      }),
    ]);

    const staff = business?.staff[0];
    expect(staff).toBeDefined();
    expect(staff).not.toHaveProperty("phone");
    expect(staff).not.toHaveProperty("email");
    expect(staff).not.toHaveProperty("businessId");
    expect(staff).not.toHaveProperty("role");

    expect(
      business?.photos.some((photo) => photo.url.includes("appointments/")),
    ).toBe(false);
  });
});
