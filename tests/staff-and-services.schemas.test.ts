import { CommissionType, StaffTimeOffType } from "@prisma/client";
import {
  createServiceSchema,
  updateServiceSchema,
} from "../src/modules/services/services.schema";
import {
  assignServiceSchema,
  createTimeOffSchema,
  replaceAvailabilitySchema,
  updateServiceStaffSchema,
} from "../src/modules/staff/staff.schema";

describe("service duration validation", () => {
  const baseService = {
    name: "Consultation",
    priceEgp: 0,
    isActive: true,
    staffIds: [],
  };

  it.each([5, 10, 15, 50, 60])("accepts %i-minute services", (durationMin) => {
    expect(
      createServiceSchema.safeParse({ ...baseService, durationMin }).success,
    ).toBe(true);
  });

  it.each([1, 6, 12, 51])("rejects %i-minute services", (durationMin) => {
    expect(
      createServiceSchema.safeParse({ ...baseService, durationMin }).success,
    ).toBe(false);
  });

  it("applies the same rule when updating a service", () => {
    expect(updateServiceSchema.safeParse({ durationMin: 45 }).success).toBe(true);
    expect(updateServiceSchema.safeParse({ durationMin: 46 }).success).toBe(false);
  });
});

describe("per-service staff commission validation", () => {
  const serviceId = "123e4567-e89b-12d3-a456-426614174000";

  it("accepts decimal percentage commissions", () => {
    expect(
      assignServiceSchema.safeParse({
        serviceId,
        commissionType: CommissionType.PERCENT,
        commissionAmount: 12.5,
      }).success,
    ).toBe(true);

    expect(
      updateServiceStaffSchema.safeParse({
        commissionType: CommissionType.PERCENT,
        commissionAmount: 17.75,
      }).success,
    ).toBe(true);
  });

  it("rejects invalid percentage commissions", () => {
    expect(
      updateServiceStaffSchema.safeParse({
        commissionType: CommissionType.PERCENT,
        commissionAmount: 0,
      }).success,
    ).toBe(false);

    expect(
      updateServiceStaffSchema.safeParse({
        commissionType: CommissionType.PERCENT,
        commissionAmount: 100.01,
      }).success,
    ).toBe(false);
  });

  it("requires NONE commission to have zero amount", () => {
    expect(
      updateServiceStaffSchema.safeParse({
        commissionType: CommissionType.NONE,
        commissionAmount: 0,
      }).success,
    ).toBe(true);

    expect(
      updateServiceStaffSchema.safeParse({
        commissionType: CommissionType.NONE,
        commissionAmount: 1,
      }).success,
    ).toBe(false);
  });
});

describe("staff scheduling validation", () => {
  it("allows multiple non-overlapping intervals on the same weekday", () => {
    expect(
      replaceAvailabilitySchema.safeParse([
        { dayOfWeek: 1, startTime: "09:00", endTime: "13:00" },
        { dayOfWeek: 1, startTime: "17:00", endTime: "21:00" },
      ]).success,
    ).toBe(true);
  });

  it("rejects intervals whose end is not after the start", () => {
    expect(
      replaceAvailabilitySchema.safeParse([
        { dayOfWeek: 1, startTime: "17:00", endTime: "09:00" },
      ]).success,
    ).toBe(false);
  });

  it("accepts valid date-range time off and rejects reversed ranges", () => {
    expect(
      createTimeOffSchema.safeParse({
        startsOn: "2026-07-25",
        endsOn: "2026-08-01",
        type: StaffTimeOffType.VACATION,
      }).success,
    ).toBe(true);

    expect(
      createTimeOffSchema.safeParse({
        startsOn: "2026-08-01",
        endsOn: "2026-07-25",
        type: StaffTimeOffType.VACATION,
      }).success,
    ).toBe(false);
  });
});
