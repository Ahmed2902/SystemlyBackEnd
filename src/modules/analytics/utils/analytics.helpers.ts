export const toNumber = (value: unknown, fallback = 0) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
};

export const toPercentage = (numerator: number, denominator: number) => {
  if (
    !Number.isFinite(numerator) ||
    !Number.isFinite(denominator) ||
    denominator <= 0
  ) {
    return 0;
  }
  return numerator / denominator;
};

export const roundCents = (value: number) => Math.round(Number(value) || 0);

export const normalizeSource = (source?: string | null) => {
  const cleaned = source?.trim();
  return cleaned && cleaned.length > 0 ? cleaned : "unknown";
};

export const formatDayName = (weekday: number) => {
  const names = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  return names[weekday] ?? "Unknown";
};

export const formatRelativeBucket = (bucket: string) => {
  switch (bucket) {
    case "same_day":
      return "Same day";
    case "1_2_days":
      return "1-2 days";
    case "3_7_days":
      return "3-7 days";
    default:
      return "1 week+";
  }
};

export const safeDateString = (value: Date | string | null | undefined) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

export const growthRate = (current: number, previous: number) => {
  if (
    !Number.isFinite(current) ||
    !Number.isFinite(previous) ||
    previous <= 0
  ) {
    return null;
  }
  return (current - previous) / previous;
};

export const ensureArray = <T>(value: T[] | null | undefined) => value ?? [];
