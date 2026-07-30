import { AppointmentStatus, PaymentMethod } from "@prisma/client";
import { collectPaymentSchema } from "../src/modules/invoices/invoices.workspace.schema";

const appointmentId = "123e4567-e89b-12d3-a456-426614174000";
const serviceId = "123e4567-e89b-12d3-a456-426614174001";
const staffId = "123e4567-e89b-12d3-a456-426614174002";
const segmentId = "123e4567-e89b-12d3-a456-426614174003";

const appointmentUpdate = {
  segments: [
    {
      id: segmentId,
      serviceId,
      staffId,
      startsAt: "2026-07-30T09:00:00.000Z",
      endsAt: "2026-07-30T09:45:00.000Z",
    },
  ],
  customItems: [
    {
      description: "Custom item",
      quantity: 1,
      priceCents: 5_000,
    },
  ],
  discountCents: 0,
  notes: "",
};

describe("collect payment with pending appointment edits", () => {
  it("accepts an appointment update in the payment command", () => {
    const parsed = collectPaymentSchema.safeParse({
      appointmentId,
      discountCents: 0,
      paymentMethod: PaymentMethod.CASH,
      appointmentUpdate,
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.appointmentUpdate?.customItems[0].priceCents).toBe(5_000);
    }
  });

  it("applies the update before building the invoice", async () => {
    jest.resetModules();

    const calls: string[] = [];
    const invoiceCreate = jest.fn(async ({ data }) => {
      calls.push("invoice");
      return data;
    });
    const tx = {
      invoice: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: invoiceCreate,
      },
      appointment: {
        findFirst: jest.fn(async () => {
          calls.push("read");
          return {
            id: appointmentId,
            businessId: "business-1",
            customerId: "customer-1",
            startsAt: new Date("2026-07-30T09:00:00.000Z"),
            status: AppointmentStatus.confirmed,
            business: { timezone: "UTC" },
            customItems: [
              {
                description: "Custom item",
                quantity: 1,
                priceCents: 5_000,
              },
            ],
            appointmentServices: [
              {
                serviceId,
                staffId,
                priceEgpSnapshot: 300,
                service: { name: "Service" },
              },
            ],
          };
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      serviceStaff: { findMany: jest.fn().mockResolvedValue([]) },
      invoiceCounter: {
        upsert: jest.fn().mockResolvedValue({ lastNumber: 1 }),
      },
      customer: { update: jest.fn().mockResolvedValue({}) },
    };
    const updateAppointmentInTransaction = jest.fn(async () => {
      calls.push("update");
    });

    jest.doMock("../src/shared/db/prisma", () => ({
      prisma: {
        $transaction: async (callback: (client: typeof tx) => unknown) =>
          callback(tx),
      },
    }));
    jest.doMock(
      "../src/modules/appointments/appointments.command.service",
      () => ({ updateAppointmentInTransaction }),
    );
    jest.doMock(
      "../src/modules/appointments/appointments.query.service",
      () => ({
        __esModule: true,
        default: {
          getAppointmentById: jest.fn().mockResolvedValue({
            id: appointmentId,
            status: AppointmentStatus.completed,
            invoice: { status: "paid" },
          }),
        },
      }),
    );

    const service = require("../src/modules/invoices/invoices.command.service")
      .default;
    const invoice = await service.collectPayment("business-1", "user-1", {
      appointmentId,
      discountCents: 0,
      paymentMethod: PaymentMethod.CASH,
      appointmentUpdate,
    });

    expect(calls.slice(0, 3)).toEqual(["update", "read", "invoice"]);
    expect(updateAppointmentInTransaction).toHaveBeenCalledWith(
      tx,
      appointmentId,
      "business-1",
      appointmentUpdate,
    );
    expect(invoice.subtotalCents).toBe(35_000);
    expect(invoice.totalCents).toBe(35_000);
    expect(invoice.updatedAppointment).toMatchObject({
      id: appointmentId,
      status: AppointmentStatus.completed,
      invoice: { status: "paid" },
    });
  });
});
