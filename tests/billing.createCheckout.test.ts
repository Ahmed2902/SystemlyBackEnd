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

jest.mock("../src/shared/db/prisma", () => ({
  prisma: {
    plan: {
      findFirst: jest.fn().mockResolvedValue(mockedPlan),
    },
    subscription: {
      upsert: jest.fn().mockResolvedValue(mockedSubscription),
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
const db = require("../src/shared/db/prisma");

describe("billing.createCheckout", () => {
  it("upserts the selected subscription", async () => {
    const result = await createCheckout("bus1", "plan1");

    expect(result.subscription).toEqual(mockedSubscription);
    expect(db.prisma.subscription.upsert).toHaveBeenCalledWith({
      where: { businessId: "bus1" },
      create: expect.objectContaining({
        businessId: "bus1",
        planId: "plan1",
        priceId: "price1",
      }),
      update: { planId: "plan1", priceId: "price1" },
    });
  });
});
