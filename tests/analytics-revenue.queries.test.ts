const queryRaw = jest.fn();
const aggregate = jest.fn();

jest.mock("../src/shared/db/prisma", () => ({
  prisma: {
    $queryRaw: (...args: unknown[]) => queryRaw(...args),
    invoice: { aggregate: (...args: unknown[]) => aggregate(...args) },
  },
}));

import {
  getAverageInvoiceValueTrend,
  getRevenueByWeekday,
  getRevenueTrend,
} from "../src/modules/analytics/queries/revenue.queries";

function renderedQuery() {
  const query = queryRaw.mock.calls[0]?.[0] as { strings?: readonly string[] };
  return query.strings?.join("?") ?? "";
}

describe("revenue analytics timezone bucketing", () => {
  const businessId = "11111111-1111-1111-1111-111111111111";
  const from = new Date("2026-07-30T21:00:00.000Z");
  const to = new Date("2026-07-31T20:59:59.999Z");

  beforeEach(() => queryRaw.mockReset());

  test.each([
    ["revenue trend", () => getRevenueTrend(businessId, from, to, "hour")],
    ["average invoice trend", () => getAverageInvoiceValueTrend(businessId, from, to, "hour")],
    ["weekday totals", () => getRevenueByWeekday(businessId, from, to)],
  ])("converts UTC timestamp columns to Cairo local time for %s", async (_label, run) => {
    queryRaw.mockResolvedValue([]);

    await run();

    expect(renderedQuery()).toContain("paid_at AT TIME ZONE 'UTC' AT TIME ZONE");
  });
});
