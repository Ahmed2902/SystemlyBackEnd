// Mock the bookings service before importing app so controller uses mocked implementation
jest.mock("../src/modules/bookings/bookings.service", () => ({
  createBooking: jest.fn().mockResolvedValue({}),
}));

import request from "supertest";
import app from "../app";

describe("public booking rate limiter", () => {
  test("blocks after 10 attempts from same IP", async () => {
    const payload = {
      businessId: "b1",
      serviceId: "s1",
      startsAt: "2026-05-01T10:00:00Z",
      customerName: "Test",
      customerPhone: "+201234567890",
    };

    const agent = request(app);
    let lastRes: any = null;
    for (let i = 0; i < 11; i++) {
      // ensure same IP via X-Forwarded-For
      // first 10 should succeed (201), 11th should be 429
      lastRes = await agent
        .post("/api/booking")
        .set("X-Forwarded-For", "127.0.0.1")
        .send(payload);
    }

    expect(lastRes.status).toBe(429);
    expect(lastRes.body).toEqual(
      expect.objectContaining({ success: false, code: "BOOKING_RATE_LIMITED" })
    );
  });
});
