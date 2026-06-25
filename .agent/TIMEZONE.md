# Timezone Policy

## Source Of Truth

Store timestamps in PostgreSQL in UTC. Prisma `DateTime` values are
treated as UTC everywhere in the backend.

`Business.timezone` is used only for:

- UI presentation
- local business rules
- analytics grouped by local day, week, or month
- local-clock scheduling decisions that must be converted to UTC before
  persistence or querying

Never store local business time directly in the database.

## Conversion Boundary Rules

Convert only at system boundaries:

- Incoming local user input -> UTC before persistence
- UTC stored values -> business-local time before presentation
- Local business day boundaries -> UTC ranges before Prisma queries

Do not convert inside ordinary timestamp comparisons such as:

- `endsAt < now`
- `paidAt < cutoff`
- `createdAt > someUtcDate`

These comparisons should remain UTC against UTC.

## Correct Patterns

### Create or store an instant

If a request sends a local business timestamp, convert it to UTC before
writing to the database.

If a request already sends an ISO instant with `Z` or an offset, keep it
as an instant and store it unchanged.

### Query a business-local day

Compute the local midnight boundary first, then convert the boundary to
UTC, then query Prisma with the UTC range.

### Render a date in the UI

Read the stored UTC timestamp, convert it to `business.timezone`, then
format it for display.

## Incorrect Patterns

- Storing Cairo time, London time, or any other local wall-clock value
  directly in Prisma `DateTime`
- Re-parsing a stored UTC instant as if it were a local wall-clock time
- Comparing two timestamps after converting one side to a different zone
- Using the server timezone as a proxy for the business timezone

## Shared Utility

Use `src/shared/utils/timezone.ts` for timezone-aware conversions and
date-range boundaries.

Preferred helpers:

- `toBusinessTime(date, timezone)`
- `toUtcFromBusinessTime(localIsoString, timezone)`
- `getBusinessDayRange(timezone, date?)`
- `getBusinessWeekRange(timezone, date?)`
- `getBusinessMonthRange(timezone, date?)`

Luxon is the only approved timezone library for new boundary logic.

## Current Exceptions And Risks

- `Availability.startTime`, `Availability.endTime`, and
  `AvailabilityOverride.startTime` / `endTime` are modeled as `DateTime`
  even though they behave like recurring local time-of-day values.
  Existing code still treats them as business-local scheduling data.
  This should be revisited in a schema cleanup if the model changes.
- Luxon is the only approved timezone library for new boundary logic.

## Examples

Correct:

```ts
const { start, end } = getBusinessDayRange("Africa/Cairo", new Date());
const invoices = await prisma.invoice.findMany({
  where: {
    businessId,
    paidAt: { gte: start, lt: end },
  },
});
```

Correct:

```ts
const utcDate = toUtcFromBusinessTime("2026-06-25T22:00:00", "Africa/Cairo");
await prisma.job.create({ data: { runAt: utcDate } });
```

Incorrect:

```ts
const local = DateTime.fromISO("2026-06-25", { zone: "Africa/Cairo" }).startOf(
  "day",
);
await prisma.invoice.findMany({ where: { paidAt: { gte: local.toDate() } } });
```

## Rule For Future Contributors

Store in UTC. Display in business timezone. Convert only at system
boundaries.
