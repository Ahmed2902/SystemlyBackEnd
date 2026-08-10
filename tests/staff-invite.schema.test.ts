import { Roles } from "@prisma/client";
import { createInviteSchema } from "../src/modules/staff/staff.schema";

describe("staff invite schema", () => {
  test.each([Roles.Receptionist, Roles.Staff])(
    "accepts the %s role sent by the staff invite form",
    (role) => {
      const parsed = createInviteSchema.safeParse({
        email: "team@example.com",
        role,
      });

      expect(parsed.success).toBe(true);
      if (parsed.success) expect(parsed.data.role).toBe(role);
    },
  );

  test("does not allow invitation of an administrator", () => {
    expect(
      createInviteSchema.safeParse({
        email: "admin@example.com",
        role: Roles.BusinessAdmin,
      }).success,
    ).toBe(false);
  });
});
