import { DateTime } from "luxon";
import {
  automaticGranularity,
  resolveAnalyticsPeriod,
} from "./periods";

const CLOCK = () => new Date("2026-08-05T13:00:00.000Z");
const BUSINESS_CREATED_AT = new Date("2025-01-01T00:00:00.000Z");
const TIMEZONE = "Africa/Cairo";

function localDate(value: Date) {
  return DateTime.fromJSDate(value).setZone(TIMEZONE).toISODate();
}

describe("resolveAnalyticsPeriod", () => {
  test("resolves rolling thirty-day periods with equal preceding comparison", () => {
    const period = resolveAnalyticsPeriod(
      { mode: "rolling", preset: "last_30_days" },
      { businessCreatedAt: BUSINESS_CREATED_AT, timezone: TIMEZONE, clock: CLOCK },
    );

    expect(period.granularity).toBe("week");
    expect(period.comparison).not.toBeNull();
    expect(
      period.toExclusive.getTime() - period.from.getTime(),
    ).toBe(period.from.getTime() - period.comparison!.from.getTime());
  });

  test("last three complete months on August 5 are May through July", () => {
    const period = resolveAnalyticsPeriod(
      { mode: "completed", unit: "month", count: 3 },
      { businessCreatedAt: BUSINESS_CREATED_AT, timezone: TIMEZONE, clock: CLOCK },
    );

    expect(localDate(period.from)).toBe("2026-05-01");
    expect(localDate(period.toExclusive)).toBe("2026-08-01");
    expect(localDate(period.comparison!.from)).toBe("2026-02-01");
    expect(localDate(period.comparison!.toExclusive)).toBe("2026-05-01");
  });

  test("completed weeks exclude the current incomplete Monday-Sunday week", () => {
    const period = resolveAnalyticsPeriod(
      { mode: "completed", unit: "week", count: 4 },
      { businessCreatedAt: BUSINESS_CREATED_AT, timezone: TIMEZONE, clock: CLOCK },
    );

    expect(DateTime.fromJSDate(period.toExclusive).setZone(TIMEZONE).weekday).toBe(
      1,
    );
    expect(localDate(period.toExclusive)).toBe("2026-08-03");
  });

  test("custom ranges have no comparison and choose weekly buckets at 45 days", () => {
    const period = resolveAnalyticsPeriod(
      { mode: "custom", from: "2026-06-22", to: "2026-08-05" },
      { businessCreatedAt: BUSINESS_CREATED_AT, timezone: TIMEZONE, clock: CLOCK },
    );

    expect(period.comparison).toBeNull();
    expect(period.granularity).toBe("week");
    expect(localDate(period.toExclusive)).toBe("2026-08-06");
  });

  test("uses monthly buckets above ninety days", () => {
    expect(automaticGranularity(91)).toBe("month");
  });
});
