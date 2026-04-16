import { generateSlots } from "../src/shared/utils/slots.util";

describe("generateSlots", () => {
  test("generates expected slots for example day", () => {
    const params = {
      date: "2026-04-20",
      startTime: "09:00",
      endTime: "17:00",
      durationMin: 45,
      breakAfterMin: 0,
      bookedSlots: [
        { starts_at: "2026-04-20T10:00:00Z", ends_at: "2026-04-20T10:30:00Z" },
        { starts_at: "2026-04-20T13:00:00Z", ends_at: "2026-04-20T14:00:00Z" },
      ],
      timezone: "UTC",
    };

    const slots = generateSlots(params);
    const times = slots.map((s) => s.display);

    expect(times).toEqual([
      "09:00",
      "10:30",
      "11:15",
      "12:00",
      "14:00",
      "14:45",
      "15:30",
      "16:15",
    ]);
  });
});
