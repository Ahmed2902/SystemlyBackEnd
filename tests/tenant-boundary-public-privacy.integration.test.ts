import { Roles, SubscriptionStatus } from "@prisma/client";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import businessService from "../src/modules/business/business.service";
import { ensureCorePlan } from "../src/modules/subscriptions/subscription.seed";
import { prisma } from "../src/shared/db/prisma";
import { requireBusinessAccessFor } from "../src/shared/middleware/auth.middleware";
import {
  requireAvailabilityOverrideAccess,
  requireFaqAccess,
  requireProtectedStaffFieldAccess,
  requireServiceBodyAccess,
  requireServiceIdsBodyAccess,
  requireStaffAccess,
} from "../src/shared/middleware/tenant-resource.middleware";

let businessAId: string;
let businessBId: string;
let businessASlug: string;
let faqAId: string;
let faqBId: string;
let staffAId: string;
let staffBId: string;
let serviceAId: string;
let serviceBId: string;
let overrideBId: string;

async function createBusinessFixture(label: string) {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const business = await prisma.business.create({
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
  const branch = await prisma.branch.create({
    data: {
      businessId: business.id,
      name: "Main Branch",
      slug: "main",
      phone: business.phone,
      timezone: business.timezone,
      isActive: true,
    },
  });
  return { ...business, branchId: branch.id };
}

function requestFor(
  businessId: string,
  params: Record<string, string> = {},
  body: unknown = {},
  role: Roles = Roles.BusinessAdmin,
): Request {
  return {
    params,
    body,
    requestId: "tenant-boundary-test",
    user: {
      id: "00000000-0000-0000-0000-000000000001",
      businessId,
      role,
    },
  } as unknown as Request;
}

function responseDouble() {
  const res: any = { statusCode: 200, body: undefined };
  res.status = jest.fn((statusCode: number) => {
    res.statusCode = statusCode;
    return res;
  });
  res.json = jest.fn((body: unknown) => {
    res.body = body;
    return res;
  });
  return res as Response & { statusCode: number; body: unknown };
}

async function runMiddleware(handler: RequestHandler, req: Request) {
  const res = responseDouble();
  const next = jest.fn() as unknown as NextFunction;
  await handler(req, res, next);
  return { res, next };
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

  const [faqA, faqB, staffA, staffB, serviceA, serviceB] = await Promise.all([
    prisma.faq.create({
      data: {
        businessId: businessA.id,
        question: "Tenant A FAQ",
        answer: "Tenant A only",
      },
    }),
    prisma.faq.create({
      data: {
        businessId: businessB.id,
        question: "Private tenant B FAQ",
        answer: "Tenant B only",
      },
    }),
    prisma.staff.create({
      data: {
        businessId: businessA.id,
        branchId: businessA.branchId,
        name: "Public Staff",
        jobTitle: "Stylist",
        phone: "+201222222222",
        email: `private-a-${Date.now()}@example.com`,
        isActive: true,
      },
    }),
    prisma.staff.create({
      data: {
        businessId: businessB.id,
        branchId: businessB.branchId,
        name: "Tenant B Staff",
        phone: "+201111111111",
        email: `tenant-b-${Date.now()}@example.com`,
        isActive: true,
      },
    }),
    prisma.service.create({
      data: {
        businessId: businessA.id,
        branchId: businessA.branchId,
        name: "Tenant A Service",
        durationMin: 30,
        priceEgp: 90,
        isActive: true,
      },
    }),
    prisma.service.create({
      data: {
        businessId: businessB.id,
        branchId: businessB.branchId,
        name: "Tenant B Service",
        durationMin: 30,
        priceEgp: 100,
        isActive: true,
      },
    }),
  ]);

  faqAId = faqA.id;
  faqBId = faqB.id;
  staffAId = staffA.id;
  staffBId = staffB.id;
  serviceAId = serviceA.id;
  serviceBId = serviceB.id;

  await prisma.serviceStaff.create({
    data: { staffId: staffB.id, serviceId: serviceB.id },
  });

  const override = await prisma.availabilityOverride.create({
    data: {
      staffId: staffB.id,
      overrideDate: new Date("2030-01-07T00:00:00.000Z"),
      isDayOff: true,
    },
  });
  overrideBId = override.id;

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

describe("tenant authorization middleware", () => {
  test("blocks a business route targeting another tenant", async () => {
    const { res, next } = await runMiddleware(
      requireBusinessAccessFor("id"),
      requestFor(businessAId, { id: businessBId }),
    );
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  test("allows a business route targeting the authenticated tenant", async () => {
    const { next } = await runMiddleware(
      requireBusinessAccessFor("id"),
      requestFor(businessAId, { id: businessAId }),
    );
    expect(next).toHaveBeenCalledTimes(1);
  });

  test("blocks cross-tenant FAQ access", async () => {
    const blocked = await runMiddleware(
      requireFaqAccess,
      requestFor(businessAId, { id: faqBId }),
    );
    expect(blocked.res.statusCode).toBe(404);
    expect(blocked.next).not.toHaveBeenCalled();

    const allowed = await runMiddleware(
      requireFaqAccess,
      requestFor(businessAId, { id: faqAId }),
    );
    expect(allowed.next).toHaveBeenCalledTimes(1);
  });

  test("blocks cross-tenant staff, service and override access", async () => {
    const staff = await runMiddleware(
      requireStaffAccess,
      requestFor(businessAId, { id: staffBId }),
    );
    expect(staff.res.statusCode).toBe(404);

    const ownStaff = await runMiddleware(
      requireStaffAccess,
      requestFor(businessAId, { id: staffAId }),
    );
    expect(ownStaff.next).toHaveBeenCalledTimes(1);

    const service = await runMiddleware(
      requireServiceBodyAccess(),
      requestFor(businessAId, { id: staffAId }, { serviceId: serviceBId }),
    );
    expect(service.res.statusCode).toBe(404);

    const override = await runMiddleware(
      requireAvailabilityOverrideAccess,
      requestFor(businessAId, {
        id: staffAId,
        overrideId: overrideBId,
      }),
    );
    expect(override.res.statusCode).toBe(404);
  });

  test("keeps protected staff fields and service ownership in middleware", async () => {
    const protectedField = await runMiddleware(
      requireProtectedStaffFieldAccess,
      requestFor(
        businessAId,
        { id: staffAId },
        { isActive: false },
        Roles.Receptionist,
      ),
    );
    expect(protectedField.res.statusCode).toBe(403);
    expect(protectedField.next).not.toHaveBeenCalled();

    const normalEdit = await runMiddleware(
      requireProtectedStaffFieldAccess,
      requestFor(
        businessAId,
        { id: staffAId },
        { name: "Updated" },
        Roles.Receptionist,
      ),
    );
    expect(normalEdit.next).toHaveBeenCalledTimes(1);

    const ownServices = await runMiddleware(
      requireServiceIdsBodyAccess(),
      requestFor(businessAId, {}, { serviceIds: [serviceAId] }),
    );
    expect(ownServices.next).toHaveBeenCalledTimes(1);

    const foreignServices = await runMiddleware(
      requireServiceIdsBodyAccess(),
      requestFor(businessAId, {}, { serviceIds: [serviceBId] }),
    );
    expect(foreignServices.res.statusCode).toBe(404);
    expect(foreignServices.next).not.toHaveBeenCalled();
  });
});

describe("public business projection", () => {
  test("returns gallery photos and intentional public staff fields only", async () => {
    const business = await businessService.getPublicBySlug(businessASlug);
    expect(business).not.toBeNull();
    expect(business?.photos).toEqual([
      expect.objectContaining({ url: "https://example.com/gallery.jpg" }),
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
