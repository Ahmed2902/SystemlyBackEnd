export type ComparisonDirection = "increase" | "decrease" | "flat";
export type ComparisonState =
  | "comparable"
  | "new_activity"
  | "no_activity";

export interface NumericComparison {
  current: number;
  previous: number;
  absoluteChange: number;
  percentageChange: number | null;
  direction: ComparisonDirection;
  comparisonState: ComparisonState;
}

export function roundPercentage(value: number): number {
  return Math.round(value * 10) / 10;
}

export function calculateChange(
  current: number,
  previous: number,
): NumericComparison {
  const absoluteChange = current - previous;

  if (previous === 0 && current === 0) {
    return {
      current,
      previous,
      absoluteChange: 0,
      percentageChange: 0,
      direction: "flat",
      comparisonState: "no_activity",
    };
  }

  if (previous === 0) {
    return {
      current,
      previous,
      absoluteChange,
      percentageChange: null,
      direction: "increase",
      comparisonState: "new_activity",
    };
  }

  const percentageChange = roundPercentage(
    (absoluteChange / previous) * 100,
  );
  return {
    current,
    previous,
    absoluteChange,
    percentageChange,
    direction:
      absoluteChange > 0
        ? "increase"
        : absoluteChange < 0
          ? "decrease"
          : "flat",
    comparisonState: "comparable",
  };
}

export function calculateRate(numerator: number, denominator: number): number {
  return denominator > 0 ? roundPercentage((numerator / denominator) * 100) : 0;
}

export function calculateWeightedRate(
  rows: ReadonlyArray<{ numerator: number; denominator: number }>,
): number {
  const numerator = rows.reduce((sum, row) => sum + row.numerator, 0);
  const denominator = rows.reduce((sum, row) => sum + row.denominator, 0);
  return calculateRate(numerator, denominator);
}
