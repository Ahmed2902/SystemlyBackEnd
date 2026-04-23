import { prisma } from "../src/shared/db/prisma";
import * as apptService from "../src/modules/appointments/appointments.service";
import { requireAppointmentOwnerOrAdmin } from "../src/shared/middleware/auth.middleware";

beforeEach(() => {
  jest.clearAllMocks();
});

// service-level role checks removed; middleware enforces permissions

test("Staff can only mark their own appointment as completed (middleware)", async () => {
  (prisma.appointment.findUnique as any) = jest.fn().mockResolvedValue({ id: "a1", staffId: "other", businessId: "b1" });

  const req: any = { params: { id: "a1" }, user: { id: "st1", role: "Staff", businessId: "b1" } };
  const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
  const next = jest.fn();

  await requireAppointmentOwnerOrAdmin(req, res, next);

  expect(res.status).toHaveBeenCalledWith(403);
});

test("Staff cannot see customer phone numbers in other staff's appointments", async () => {
  const items = [
    { id: "a1", staffId: "st1", customer: { phone: "+201111", email: "a@example.com" } },
    { id: "a2", staffId: "st2", customer: { phone: "+201222", email: "b@example.com" } },
  ];
  (prisma.appointment.findMany as any) = jest.fn().mockResolvedValue(items);
  (prisma.appointment.count as any) = jest.fn().mockResolvedValue(2);

  const res = await apptService.listAppointments({ user: { id: "st1", role: "Staff", businessId: "b1" }, page: 1, perPage: 10 });
  expect(res.items[0].customer.phone).toBeDefined();
  expect(res.items[0].customer.email).toBeDefined();
  expect(res.items[1].customer.phone).toBeUndefined();
  expect(res.items[1].customer.email).toBeUndefined();
});

test("Receptionist can reschedule any appointment", async () => {
  (prisma.appointment.findUnique as any) = jest.fn().mockResolvedValue({ id: "a1", service: { durationMin: 30 }, staffId: "st1" });
  (prisma.appointment.findFirst as any) = jest.fn().mockResolvedValue(null);
  (prisma.appointment.update as any) = jest.fn().mockResolvedValue({ id: "a1", startsAt: new Date().toISOString() });

  const res = await apptService.rescheduleAppointment("a1", new Date().toISOString());
  expect(res).toHaveProperty("id", "a1");
});

// TODO: implement the following tests fully
test.todo("Receptionist cannot edit business website content");
test.todo("Owner can do everything within their business");
test.todo("Owner cannot access another business's appointments");
test.todo("Superadmin can access any business's data");
test.todo("User role cannot access dashboard routes — gets ONBOARDING_INCOMPLETE");
test.todo("Expired invite token returns INVITE_EXPIRED");
test.todo("Already-used invite returns INVITE_ALREADY_USED");
test.todo("Walk-in appointment created by receptionist starts as confirmed");
test.todo("Walk-in appointment created by online flow starts as pending");
test.todo("Invalid status transition returns INVALID_STATUS_TRANSITION");
test.todo("Rescheduled appointment resets reminder flags to false");
