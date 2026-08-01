const mockedPlan = {
  id: "plan1",
  code: "CORE",
  name: "Systemly Core",
  priceEgp: 799,
  prices: [
    {
      id: "price1",
      amountCents: 79_900,
      currency: "EGP",
    },
  ],
};
const mockedSubscription = {
  id: "sub1",
  businessId: "bus1",
  planId: "plan1",
  priceId: "price1",
};

jest.mock("../src/modules/billing/paymob", () => ({
  createPaymobOrder: jest.fn().mockResolvedValue({ orderId: "order_123" }),
  createPaymentKey: jest.fn().mockResolvedValue({ paymentKey: "pk_123" }),
  getAuthToken: jest.fn().mockResolvedValue("token_123"),
}));

jest.mock("../src/shared/db/prisma", () => ({
  prisma: {
    plan: {
      findFirst: jest.fn().mockResolvedValue(mockedPlan),
    },
    subscription: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(mockedSubscription),
      update: jest.fn().mockResolvedValue({}),
    },
    businessUser: {
      findFirst: jest.fn().mockResolvedValue({
        id: "u1",
        email: "owner@example.com",
        name: "Owner",
        phone: "0123",
      }),
    },
  },
}));

const { createCheckout } = require("../src/modules/billing/billing.service");
const paymob = require("../src/modules/billing/paymob");
const db = require("../src/shared/db/prisma");

describe("billing.createCheckout", () => {
  it("creates an incomplete subscription and returns a payment key", async () => {
    const result = await createCheckout("bus1", "plan1");

    expect(result.subscription).toEqual(mockedSubscription);
    expect(result.payment).toEqual(
      expect.objectContaining({
        orderId: "order_123",
        paymentKey: { paymentKey: "pk_123" },
      }),
    );
    expect(paymob.createPaymobOrder).toHaveBeenCalledWith(
      79_900,
      "EGP",
      "Subscription Systemly Core for bus1",
    );
    expect(db.prisma.subscription.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        businessId: "bus1",
        planId: "plan1",
        priceId: "price1",
      }),
    });
  });
});
