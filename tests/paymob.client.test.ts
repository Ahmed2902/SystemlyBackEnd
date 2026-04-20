const paymobClient = require('../src/modules/billing/paymob');

describe('paymob client', () => {
  it('verifyWebhook returns verified when no secret configured', async () => {
    const res = await paymobClient.verifyWebhook({}, { hello: 'world' });
    expect(res.verified).toBe(true);
    expect(res.payload).toEqual({ hello: 'world' });
  });
});
