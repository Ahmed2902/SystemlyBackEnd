jest.mock("../src/shared/db/prisma", () => ({
  prisma: {
    invoice: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
    },
    appointment: {
      findUnique: jest.fn(),
    },
    serviceStaff: {
      findUnique: jest.fn(),
    },
    business: {
      findUnique: jest.fn(),
    },
    loyaltyAccount: {
      upsert: jest.fn(),
      updateMany: jest.fn(),
    },
    loyaltyTransaction: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

jest.mock("../src/jobs/etaReceipt.job", () => ({
  triggerEtaReceipt: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../src/modules/loyalty/loyalty.service", () => ({
  __esModule: true,
  default: {
    creditPointsForInvoice: jest.fn().mockResolvedValue({ ok: true }),
  },
}));

import { prisma } from "../src/shared/db/prisma";
import invoicesService from "../src/modules/invoices/invoices.service";
import loyaltyService from "../src/modules/loyalty/loyalty.service";

const prismaAny = prisma as any;
const loyaltyAny = loyaltyService as any;

beforeEach(() => {
  jest.clearAllMocks();
});

test("checkout snapshots staff commission onto the invoice line", async () => {
  const invoice = {
    id: "inv1",
    businessId: "bus1",
    customerId: "cus1",
    lineItems: [],
    customer: { id: "cus1" },
  };
  prismaAny.invoice.findFirst.mockResolvedValueOnce(null);
  prismaAny.appointment.findUnique.mockResolvedValueOnce({
    id: "appt1",
    businessId: "bus1",
    customerId: "cus1",
    serviceId: "svc1",
    staffId: "st1",
    status: "confirmed",
    service: { priceEgp: "100.00", name: "Cut" },
    customer: { id: "cus1" },
  });
  prismaAny.serviceStaff.findUnique.mockResolvedValueOnce({
    commissionType: "PERCENT",
    commissionAmount: 25,
  });
  prismaAny.business.findUnique.mockResolvedValueOnce({ slug: "alpha" });
  prismaAny.$transaction.mockImplementationOnce(async (cb: any) =>
    cb({
      invoice: {
        create: jest.fn().mockImplementation((args) => {
          expect(args.data.lineItems.create).toMatchObject({
            staffId: "st1",
            serviceId: "svc1",
            commissionType: "PERCENT",
            commissionAmount: 25,
            commissionEarnedCents: 2500,
          });
          return Promise.resolve(invoice);
        }),
      },
    }),
  );

  const result = await invoicesService.checkout("appt1", "bus1");

  expect(result).toBe(invoice);
  expect(prismaAny.serviceStaff.findUnique).toHaveBeenCalledWith({
    where: { serviceId_staffId: { serviceId: "svc1", staffId: "st1" } },
  });
});

test("markPaid is idempotent and only credits loyalty once on the first transition", async () => {
  const paidInvoice = {
    id: "inv1",
    businessId: "bus1",
    status: "paid",
    totalCents: 5000,
    customerId: "cus1",
    lineItems: [],
    customer: { id: "cus1" },
  };
  prismaAny.invoice.updateMany.mockResolvedValueOnce({ count: 1 });
  prismaAny.invoice.findUnique.mockResolvedValueOnce(paidInvoice);

  const result = await invoicesService.markPaid("inv1", "bus1");

  expect(result.status).toBe("paid");
  expect(loyaltyAny.creditPointsForInvoice).toHaveBeenCalledTimes(1);

  prismaAny.invoice.updateMany.mockResolvedValueOnce({ count: 0 });
  prismaAny.invoice.findUnique.mockResolvedValueOnce(paidInvoice);

  const second = await invoicesService.markPaid("inv1", "bus1");

  expect(second.status).toBe("paid");
  expect(loyaltyAny.creditPointsForInvoice).toHaveBeenCalledTimes(1);
});

test("refund voids the invoice and records a loyalty reversal", async () => {
  const paidInvoice = {
    id: "inv1",
    businessId: "bus1",
    customerId: "cus1",
    status: "paid",
    totalCents: 12000,
    lineItems: [],
    customer: { id: "cus1" },
  };
  prismaAny.invoice.findUnique.mockResolvedValueOnce(paidInvoice);
  prismaAny.$transaction.mockImplementationOnce(async (cb: any) =>
    cb({
      invoice: {
        update: jest.fn().mockResolvedValue({
          ...paidInvoice,
          status: "voided",
          voidedAt: new Date(),
        }),
      },
      loyaltyAccount: {
        upsert: jest.fn().mockResolvedValue({ id: "acct1" }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      loyaltyTransaction: {
        create: jest.fn().mockResolvedValue({ id: "txn1" }),
      },
    }),
  );

  const result = await invoicesService.refund("inv1", "bus1");

  expect(result.refundedCents).toBe(12000);
  expect(result.invoice.status).toBe("voided");
});
