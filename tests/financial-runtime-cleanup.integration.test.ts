import {
  AppointmentStatus,
  InvoiceStatus,
  PaymentMethod,
  Roles,
  SubscriptionStatus,
} from "@prisma/client";
import appointmentsCommandService from "../src/modules/appointments/appointments.command.service";
import billingService from "../src/modules/billing/billing.service";
import invoicesCommandService from "../src/modules/invoices/invoices.command.service";
import { ensureCorePlan } from "../src/modules/subscriptions/subscription.seed";
import { prisma } from "../src/shared/db/prisma";

const businessIds: string[] = [];

async function invoiceFixture() {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const business = await prisma.business.create({
    data: {
      name: "Invoice Concurrency",
      slug: `invoice-concurrency-${suffix}`,
      vertical: "salon",
      phone: `+201${suffix.replace(/\D/g, "").slice(-8).padStart(8, "0")}`,
      timezone: "Africa/Cairo",
      isActive: true,
    },
  });
  businessIds.push(business.id);
  const branch = await prisma.branch.create({
    data: {
      businessId: business.id,
      name: "Main Branch",
      slug: "main",
      timezone: business.timezone,
      isActive: true,
    },
  });

  const owner = await prisma.businessUser.create({
    data: {
      businessId: business.id,
      name: "Owner",
      email: `owner-${suffix}@example.com`,
      passwordHash: "test-password",
      emailVerified: true,
      role: Roles.BusinessAdmin,
    },
  });
  const staff = await prisma.staff.create({
    data: {
      businessId: business.id,
      branchId: branch.id,
      name: "Staff",
      isActive: true,
    },
  });
  const service = await prisma.service.create({
    data: {
      businessId: business.id,
      branchId: branch.id,
      name: "Service",
      durationMin: 30,
      priceEgp: 250,
      isActive: true,
    },
  });
  await prisma.serviceStaff.create({
    data: { staffId: staff.id, serviceId: service.id },
  });
  const customer = await prisma.customer.create({
    data: {
      businessId: business.id,
      name: "Customer",
      phone: `+202${suffix.replace(/\D/g, "").slice(-8).padStart(8, "0")}`,
    },
  });
  const startsAt = new Date("2030-01-07T10:00:00.000Z");
  const endsAt = new Date("2030-01-07T10:30:00.000Z");
  const appointment = await prisma.appointment.create({
    data: {
      businessId: business.id,
      branchId: branch.id,
      staffId: staff.id,
      customerId: customer.id,
      startsAt,
      endsAt,
      status: AppointmentStatus.confirmed,
    },
  });
  await prisma.appointmentService.create({
    data: {
      appointmentId: appointment.id,
      serviceId: service.id,
      staffId: staff.id,
      order: 0,
      startsAt,
      endsAt,
      durationMinSnapshot: 30,
      priceEgpSnapshot: 250,
    },
  });

  return { business, branch, owner, customer, appointment };
}

async function cleanupBusinesses() {
  if (businessIds.length === 0) return;
  const ids = businessIds.splice(0);
  await prisma.appointmentService.deleteMany({
    where: { appointment: { businessId: { in: ids } } },
  });
  await prisma.invoice.deleteMany({ where: { businessId: { in: ids } } });
  await prisma.appointment.deleteMany({ where: { businessId: { in: ids } } });
  await prisma.business.deleteMany({ where: { id: { in: ids } } });
}

afterEach(cleanupBusinesses);

describe("invoice financial invariants", () => {
  test("simultaneous collect-payment calls result in one paid invoice and one completed visit", async () => {
    const { business, owner, customer, appointment } = await invoiceFixture();
    const input = {
      appointmentId: appointment.id,
      discountCents: 0,
      paymentMethod: PaymentMethod.CASH,
    };

    const results = await Promise.all([
      invoicesCommandService.collectPayment(business.id, owner.id, input),
      invoicesCommandService.collectPayment(business.id, owner.id, input),
    ]);

    expect(results[0].id).toBe(results[1].id);
    expect(
      await prisma.invoice.count({
        where: {
          appointmentId: appointment.id,
          status: InvoiceStatus.paid,
        },
      }),
    ).toBe(1);

    const [reloadedAppointment, reloadedCustomer] = await Promise.all([
      prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } }),
      prisma.customer.findUniqueOrThrow({ where: { id: customer.id } }),
    ]);
    expect(reloadedAppointment.status).toBe(AppointmentStatus.completed);
    expect(reloadedCustomer.visitCount).toBe(1);
  });

  test("manual completion racing collect-payment counts the completed visit once", async () => {
    const { business, owner, customer, appointment } = await invoiceFixture();
    const input = {
      appointmentId: appointment.id,
      discountCents: 0,
      paymentMethod: PaymentMethod.CASH,
    };

    await Promise.all([
      appointmentsCommandService.finishAppointment(
        appointment.id,
        business.id,
        {},
      ),
      invoicesCommandService.collectPayment(business.id, owner.id, input),
    ]);

    const [paidCount, reloadedAppointment, reloadedCustomer] =
      await Promise.all([
        prisma.invoice.count({
          where: {
            appointmentId: appointment.id,
            status: InvoiceStatus.paid,
          },
        }),
        prisma.appointment.findUniqueOrThrow({
          where: { id: appointment.id },
        }),
        prisma.customer.findUniqueOrThrow({ where: { id: customer.id } }),
      ]);

    expect(paidCount).toBe(1);
    expect(reloadedAppointment.status).toBe(AppointmentStatus.completed);
    expect(reloadedCustomer.visitCount).toBe(1);
  });

  test("paid -> voided -> paid again leaves one current paid invoice and one completed visit", async () => {
    const { business, owner, customer, appointment } = await invoiceFixture();
    const input = {
      appointmentId: appointment.id,
      discountCents: 0,
      paymentMethod: PaymentMethod.CASH,
    };

    const first = await invoicesCommandService.collectPayment(
      business.id,
      owner.id,
      input,
    );
    await invoicesCommandService.voidInvoice(
      first.id,
      business.id,
      owner.id,
      { reason: "Cashier correction" },
    );
    const second = await invoicesCommandService.collectPayment(
      business.id,
      owner.id,
      input,
    );

    expect(second.id).not.toBe(first.id);
    expect(
      await prisma.invoice.count({
        where: { appointmentId: appointment.id, status: InvoiceStatus.paid },
      }),
    ).toBe(1);
    expect(
      await prisma.invoice.count({
        where: { appointmentId: appointment.id, status: InvoiceStatus.voided },
      }),
    ).toBe(1);

    const customerAfter = await prisma.customer.findUniqueOrThrow({
      where: { id: customer.id },
    });
    expect(customerAfter.visitCount).toBe(1);
  });

  test("appointment revert racing invoice void decrements a completed visit once", async () => {
    const { business, owner, customer, appointment } = await invoiceFixture();
    const paid = await invoicesCommandService.collectPayment(
      business.id,
      owner.id,
      {
        appointmentId: appointment.id,
        discountCents: 0,
        paymentMethod: PaymentMethod.CASH,
      },
    );

    const results = await Promise.allSettled([
      appointmentsCommandService.revertAppointment(
        appointment.id,
        business.id,
      ),
      invoicesCommandService.voidInvoice(
        paid.id,
        business.id,
        owner.id,
        { reason: "Concurrent correction" },
      ),
    ]);

    expect(results.some((result) => result.status === "fulfilled")).toBe(true);
    const [reloadedInvoice, reloadedAppointment, reloadedCustomer] =
      await Promise.all([
        prisma.invoice.findUniqueOrThrow({ where: { id: paid.id } }),
        prisma.appointment.findUniqueOrThrow({
          where: { id: appointment.id },
        }),
        prisma.customer.findUniqueOrThrow({ where: { id: customer.id } }),
      ]);

    expect(reloadedInvoice.status).toBe(InvoiceStatus.voided);
    expect(reloadedAppointment.status).not.toBe(AppointmentStatus.completed);
    expect(reloadedCustomer.visitCount).toBe(0);
  });
});

describe("pilot subscription extension", () => {
  test("extends an expired trial without creating a fake payment", async () => {
    const { plan } = await ensureCorePlan();
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const business = await prisma.business.create({
      data: {
        name: "Pilot Extension",
        slug: `pilot-extension-${suffix}`,
        vertical: "salon",
        phone: "+201111111111",
        isActive: true,
        trialUsedAt: new Date("2026-07-01T00:00:00.000Z"),
      },
    });
    businessIds.push(business.id);
    await prisma.subscription.create({
      data: {
        businessId: business.id,
        planId: plan.id,
        status: SubscriptionStatus.EXPIRED,
        trialStartedAt: new Date("2026-07-01T00:00:00.000Z"),
        trialEndsAt: new Date("2026-07-15T00:00:00.000Z"),
        endedAt: new Date("2026-07-15T00:00:00.000Z"),
      },
    });

    const now = new Date("2026-08-07T12:00:00.000Z");
    const updated = await billingService.extendPilotTrial(business.id, 14, now);

    expect(updated.status).toBe(SubscriptionStatus.TRIALING);
    expect(updated.trialEndsAt?.toISOString()).toBe("2026-08-21T12:00:00.000Z");
    expect(updated.endedAt).toBeNull();
    expect(
      await prisma.subscriptionPayment.count({
        where: { subscriptionId: updated.id },
      }),
    ).toBe(0);
  });
});
