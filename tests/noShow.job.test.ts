jest.useRealTimers();

import noShowJob from "../src/jobs/noShow.job";
import * as svc from "../src/modules/appointments/appointments.service";

jest.mock("../src/modules/appointments/appointments.service", () => ({
  markNoShows: jest.fn().mockResolvedValue({ count: 0 }),
}));

describe("NoShow job register", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("calls markNoShows on register", async () => {
    // call register and wait a tick for the initial run
    noShowJob.register();
    // give the job a moment to call the mocked function
    await new Promise((r) => setTimeout(r, 50));
    expect((svc as any).markNoShows).toHaveBeenCalled();
  });
});
