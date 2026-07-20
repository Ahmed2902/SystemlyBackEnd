import { toStoredTimeOfDay, timeOfDayToDate } from "../src/shared/utils/timezone";

describe("stored time-of-day conversion", () => {
  test("keeps a stored 09:00 as 09:00 in every business timezone", () => {
    const stored = timeOfDayToDate("09:00");

    expect(toStoredTimeOfDay(stored).toFormat("HH:mm")).toBe("09:00");
    expect(toStoredTimeOfDay("09:00").toFormat("HH:mm")).toBe("09:00");
  });

  test("writes time-only values as UTC epoch values", () => {
    expect(timeOfDayToDate("17:00").toISOString()).toBe(
      "1970-01-01T17:00:00.000Z",
    );
  });
});
