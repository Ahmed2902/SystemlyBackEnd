const queryRaw = jest.fn();

jest.mock("../src/shared/db/prisma", () => ({
  prisma: {
    $queryRaw: (...args: unknown[]) => queryRaw(...args),
  },
}));

import {
  getCustomerRangeSummary,
  getCustomItemRevenue,
} from "../src/modules/analytics/queries/summary.queries";

describe("analytics summary queries", () => {
  beforeEach(() => queryRaw.mockReset());

  test("maps unique active, new, and returning customer counts", async () => {
    queryRaw.mockResolvedValue([
      {
        active_customers: 10n,
        new_customers: 2n,
        returning_customers: 8n,
      },
    ]);

    await expect(
      getCustomerRangeSummary(
        "11111111-1111-1111-1111-111111111111",
        new Date("2026-07-01T00:00:00.000Z"),
        new Date("2026-07-31T23:59:59.999Z"),
      ),
    ).resolves.toEqual({
      activeCustomers: 10,
      newCustomers: 2,
      returningCustomers: 8,
    });
  });

  test("maps custom item quantity and revenue without service rows", async () => {
    queryRaw.mockResolvedValue([
      { description: "Hair serum", quantity: 3n, total_cents: 45000n },
      { description: "Nail repair", quantity: 1n, total_cents: 12000n },
    ]);

    await expect(
      getCustomItemRevenue(
        "11111111-1111-1111-1111-111111111111",
        new Date("2026-07-01T00:00:00.000Z"),
        new Date("2026-07-31T23:59:59.999Z"),
      ),
    ).resolves.toEqual([
      { description: "Hair serum", quantity: 3, totalCents: 45000 },
      { description: "Nail repair", quantity: 1, totalCents: 12000 },
    ]);
  });
});
