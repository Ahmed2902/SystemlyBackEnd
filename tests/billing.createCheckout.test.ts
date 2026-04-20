// Use Jest CommonJS-style mocks to ensure hoisting before imports
const mockedPlan = { id: 'plan1', name: 'Starter', priceEgp: 199 };
const mockedSub = { id: 'sub1', businessId: 'bus1', planId: 'plan1' };

jest.mock('../src/modules/billing/paymob', () => ({
  createPaymobOrder: jest.fn().mockResolvedValue({ orderId: 'order_123' }),
  createPaymentKey: jest.fn().mockResolvedValue({ paymentKey: 'pk_123' }),
  getAuthToken: jest.fn().mockResolvedValue('token_123'),
}));

jest.mock('../src/shared/db/prisma', () => ({
  prisma: {
    plan: {
      findUnique: jest.fn().mockResolvedValue(mockedPlan),
      findFirst: jest.fn().mockResolvedValue(mockedPlan),
    },
    subscription: {
      upsert: jest.fn().mockResolvedValue(mockedSub),
      update: jest.fn().mockResolvedValue({}),
    },
    businessUser: {
      findFirst: jest.fn().mockResolvedValue({ id: 'u1', email: 'owner@example.com', name: 'Owner', phone: '0123' }),
    },
  },
}));

const { createCheckout } = require('../src/modules/billing/billing.service');
const paymob = require('../src/modules/billing/paymob');
const db = require('../src/shared/db/prisma');

describe('billing.createCheckout', () => {
  it('creates subscription and returns payment key when paymob responds', async () => {
    const result = await createCheckout('bus1', 'plan1');
    expect(result.subscription).toBeDefined();
    expect(result.payment).toBeDefined();
    // payment may be either order or object with paymentKey
    expect(result.payment.paymentKey || result.payment.paymentKey?.paymentKey || result.payment.paymentKey).toBeDefined();
    expect(paymob.createPaymobOrder.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(db.prisma.subscription.upsert.mock.calls.length).toBeGreaterThanOrEqual(1);
  });
});
