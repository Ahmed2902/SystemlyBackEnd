import { computeStaffFreeIntervals } from "../src/shared/services/scheduling/staff-free-intervals.service";

const staffId = "123e4567-e89b-12d3-a456-426614174000";
const businessId = "123e4567-e89b-12d3-a456-426614174001";
const date = "2026-07-20";

function storedTime(value: string) {
  return new Date(`1970-01-01T${value}:00.000Z`);
}

function createDb({ onTimeOff = false }: { onTimeOff?: boolean } = {}) {
  return {
    availabilityOverride: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    availability: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: "morning",
          staffId,
          dayOfWeek: 1,
          startTime: storedTime("09:00"),
          endTime: storedTime("13:00"),
          breakAfterMin: null,
        },
        {
          id: "evening",
          staffId,
          dayOfWeek: 1,
          startTime: storedTime("17:00"),
          endTime: storedTime("21:00"),
          breakAfterMin: null,
        },
      ]),
    },
    appointmentService: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    staffBreak: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    staffTimeOff: {
      findMany: jest
        .fn()
        .mockResolvedValue(onTimeOff ? [{ staffId }] : []),
    },
  };
}

describe("computeStaffFreeIntervals", () => {
  it("returns every split-shift interval for the day", async () => {
    const result = await computeStaffFreeIntervals(
      [staffId],
      businessId,
      date,
      "UTC",
      undefined,
      createDb() as never,
    );

    const intervals = result.get(staffId) ?? [];
    expect(intervals).toHaveLength(2);
    expect(intervals.map((interval) => interval.start.toFormat("HH:mm"))).toEqual([
      "09:00",
      "17:00",
    ]);
    expect(intervals.map((interval) => interval.end.toFormat("HH:mm"))).toEqual([
      "13:00",
      "21:00",
    ]);
  });

  it("returns no availability while the staff member is on time off", async () => {
    const result = await computeStaffFreeIntervals(
      [staffId],
      businessId,
      date,
      "UTC",
      undefined,
      createDb({ onTimeOff: true }) as never,
    );

    expect(result.get(staffId)).toEqual([]);
  });
});
