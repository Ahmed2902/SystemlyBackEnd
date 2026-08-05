jest.mock("../shared/observability/sentry", () => ({
  initializeSentry: jest.fn(),
  captureException: jest.fn(),
  flushSentry: jest.fn(),
}));

import {
  captureException,
  flushSentry,
  initializeSentry,
} from "../shared/observability/sentry";
import { verifySentryDelivery } from "./verifySentry";

describe("verifySentryDelivery", () => {
  beforeEach(() => jest.clearAllMocks());

  test("returns the event ID after a successful flush", async () => {
    (initializeSentry as jest.Mock).mockReturnValue(true);
    (captureException as jest.Mock).mockReturnValue("event-123");
    (flushSentry as jest.Mock).mockResolvedValue(true);

    await expect(verifySentryDelivery()).resolves.toEqual({
      initialized: true,
      eventId: "event-123",
      flushed: true,
    });
    expect(flushSentry).toHaveBeenCalledWith(5_000);
  });

  test("fails clearly when Sentry is not configured", async () => {
    (initializeSentry as jest.Mock).mockReturnValue(false);

    await expect(verifySentryDelivery()).rejects.toThrow(
      "Sentry is not initialized",
    );
  });

  test("fails when the SDK cannot flush the event", async () => {
    (initializeSentry as jest.Mock).mockReturnValue(true);
    (captureException as jest.Mock).mockReturnValue("event-123");
    (flushSentry as jest.Mock).mockResolvedValue(false);

    await expect(verifySentryDelivery()).rejects.toThrow(
      "did not flush the verification event",
    );
  });
});
