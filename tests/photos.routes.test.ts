// Mock auth middleware so tests don't need real tokens
jest.mock("../src/shared/middleware/auth.middleware", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: "u1", businessId: "b1", role: "BusinessAdmin" };
    return next();
  },
  requireBusinessAccess: (_req: any, _res: any, next: any) => next(),
}));

jest.mock("../src/shared/services/cloudinary.service", () => ({
  uploadFile: jest
    .fn()
    .mockResolvedValue({ url: "https://img", publicId: "pub1" }),
  deleteFile: jest.fn().mockResolvedValue(true),
}));

jest.mock("../src/shared/db/prisma", () => ({
  prisma: {
    photo: {
      create: jest.fn().mockResolvedValue({ id: "p1", url: "https://img" }),
      findUnique: jest.fn().mockResolvedValue({ id: "p1", publicId: "pub1" }),
      delete: jest.fn().mockResolvedValue({}),
    },
  },
}));

import request from "supertest";
import app from "../app";
import fs from "fs";

describe("photos routes", () => {
  test("upload gallery", async () => {
    const res = await request(app)
      .post("/api/photos/gallery")
      .attach("file", Buffer.from("hello"), "test.jpg");

    expect(res.status).toBe(200);
    expect(res.body).toEqual(expect.objectContaining({ success: true }));
    expect(res.body.data).toEqual(expect.objectContaining({ id: "p1" }));
  });

  test("delete gallery", async () => {
    const res = await request(app).delete("/api/photos/gallery/p1");
    expect(res.status).toBe(200);
    expect(res.body).toEqual(expect.objectContaining({ success: true }));
  });
});
