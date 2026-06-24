import { generateSlots } from "../src/shared/utils/slots.util";

describe("generateSlots", () => {
  test("generates expected slots for example day", () => {
    const params = {
      date: "2026-04-20",
      startTime: "09:00",
      endTime: "17:00",
      durationMin: 45,
      breakAfterMin: 0,
      now: "2026-04-19T00:00:00Z",
      bookedSlots: [
        {
          starts_at: "2026-04-20T10:00:00Z",
          ends_at: "2026-04-20T10:30:00Z",
        },
        {
          starts_at: "2026-04-20T13:00:00Z",
          ends_at: "2026-04-20T14:00:00Z",
        },
      ],
      timezone: "UTC",
      slotIntervalMin: 15,
    };

    const slots = generateSlots(params);

    expect(slots.map((s) => s.display)).toEqual([
      "09:00",
      "09:15",

      "10:30",
      "10:45",
      "11:00",
      "11:15",
      "11:30",
      "11:45",
      "12:00",
      "12:15",

      "14:00",
      "14:15",
      "14:30",
      "14:45",
      "15:00",
      "15:15",
      "15:30",
      "15:45",
      "16:00",
      "16:15",
    ]);
  });
});
