import { markNoShows } from "../src/modules/appointments/appointments.service";
import { prisma } from "../src/shared/db/prisma";

jest.mock("../src/shared/db/prisma", () => {
  const m = {
    appointment: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
    customer: {
      update: jest.fn(),
    },
  } as any;
  return { prisma: m };
});

describe("markNoShows", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("returns 0 when no appointments found", async () => {
    (prisma.appointment.findMany as jest.Mock).mockResolvedValue([]);
    const res = await markNoShows(30);
    expect(res).toEqual({ count: 0 });
    expect(prisma.appointment.updateMany).not.toHaveBeenCalled();
  });

  test("marks appointments and increments customer counts", async () => {
    const appts = [
      { id: "a1", customerId: "c1" },
      { id: "a2", customerId: "c1" },
      { id: "a3", customerId: "c2" },
    ];
    (prisma.appointment.findMany as jest.Mock).mockResolvedValue(appts);
    (prisma.appointment.updateMany as jest.Mock).mockResolvedValue({
      count: 3,
    });
    (prisma.customer.update as jest.Mock).mockResolvedValue({});

    const res = await markNoShows(30);
    expect(res).toEqual({ count: 3 });
    expect(prisma.appointment.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["a1", "a2", "a3"] } },
      data: { status: "no_show" },
    });
    // customer c1 incremented by 2, c2 by 1
    expect(prisma.customer.update).toHaveBeenCalledTimes(2);
    expect(prisma.customer.update).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { noShowCount: { increment: 2 } },
    });
  });
});
