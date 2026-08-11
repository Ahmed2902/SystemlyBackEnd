import { Roles } from "@prisma/client";
import { createInviteSchema } from "../src/modules/staff/staff.schema";

const branchId = "2f5b2c07-8c10-4d8e-9f24-8a8ad01154d9";

describe("staff invite schema", () => {
  test("defaults invitations to Receptionist when a branch is provided", () => {
    const parsed = createInviteSchema.safeParse({
      email: "team@example.com",
      branchId,
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.role).toBe(Roles.Receptionist);
  });

  test("requires a branch assignment", () => {
    expect(createInviteSchema.safeParse({ email: "team@example.com" }).success).toBe(
      false,
    );
  });

  test.each([Roles.Staff, Roles.BusinessAdmin])("does not allow invitation of %s", (role) => {
    expect(
      createInviteSchema.safeParse({ email: "team@example.com", branchId, role }).success,
    ).toBe(false);
  });
});
