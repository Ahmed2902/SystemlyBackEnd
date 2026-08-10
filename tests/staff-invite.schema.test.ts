import { Roles } from "@prisma/client";
import { createInviteSchema } from "../src/modules/staff/staff.schema";

describe("staff invite schema", () => {
  test("defaults invitations to Receptionist", () => {
    const parsed = createInviteSchema.safeParse({ email: "team@example.com" });

    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.role).toBe(Roles.Receptionist);
  });

  test.each([Roles.Staff, Roles.BusinessAdmin])("does not allow invitation of %s", (role) => {
    expect(createInviteSchema.safeParse({ email: "team@example.com", role }).success).toBe(false);
  });
});
