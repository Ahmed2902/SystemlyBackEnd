import {
  calculateChange,
  calculateWeightedRate,
} from "./comparisons";

describe("analytics comparisons", () => {
  test("represents no activity without inventing growth", () => {
    expect(calculateChange(0, 0)).toEqual({
      current: 0,
      previous: 0,
      absoluteChange: 0,
      percentageChange: 0,
      direction: "flat",
      comparisonState: "no_activity",
    });
  });

  test("represents zero-to-positive as new activity", () => {
    expect(calculateChange(1_000, 0)).toEqual(
      expect.objectContaining({
        percentageChange: null,
        direction: "increase",
        comparisonState: "new_activity",
      }),
    );
  });

  test("represents positive-to-zero as a full decrease", () => {
    expect(calculateChange(0, 1_000)).toEqual(
      expect.objectContaining({
        percentageChange: -100,
        direction: "decrease",
      }),
    );
  });

  test("uses weighted utilization instead of averaging staff percentages", () => {
    expect(
      calculateWeightedRate([
        { numerator: 480, denominator: 480 },
        { numerator: 60, denominator: 120 },
      ]),
    ).toBe(90);
  });
});
