import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { Roles } from "@prisma/client";
import staffInviteService from "../src/modules/staff/staff-invite.service";
import { prisma } from "../src/shared/db/prisma";
import { verifyAccessToken } from "../src/shared/utils/token.util";

let businessId: string | null = null;
let userId: string | null = null;

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

afterEach(async () => {
  if (userId) {
    await prisma.businessUser.deleteMany({ where: { id: userId } });
    userId = null;
  }
  if (businessId) {
    await prisma.business.deleteMany({ where: { id: businessId } });
    businessId = null;
  }
});

describe("receptionist invitations", () => {
  test("resolves the invited account state and attaches the verified user", async () => {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const email = `reception-${suffix}@example.com`;
    const token = crypto.randomBytes(32).toString("hex");

    const business = await prisma.business.create({
      data: {
        name: "Receptionist Invite Test",
        slug: `receptionist-invite-${suffix}`,
        vertical: "salon",
        phone: `+201${suffix.slice(-8)}`,
        timezone: "UTC",
        isActive: true,
      },
    });
    businessId = business.id;

    await prisma.staffInvite.create({
      data: {
        businessId: business.id,
        email,
        role: Roles.Receptionist,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    await expect(staffInviteService.resolve(token)).resolves.toMatchObject({
      email,
      accountExists: false,
      businessName: business.name,
    });

    await expect(
      staffInviteService.validateForEmail(token, `wrong-${email}`),
    ).rejects.toMatchObject({ code: "INVITE_EMAIL_MISMATCH" });

    const user = await prisma.businessUser.create({
      data: {
        name: "Reception User",
        email,
        passwordHash: await bcrypt.hash("Password123!", 4),
        emailVerified: true,
        role: Roles.User,
      },
    });
    userId = user.id;

    await expect(staffInviteService.resolve(token)).resolves.toMatchObject({
      email,
      accountExists: true,
      businessName: business.name,
    });

    const accepted = await staffInviteService.accept(token, user.id);

    await expect(
      prisma.businessUser.findUniqueOrThrow({
        where: { id: user.id },
        select: { businessId: true, role: true },
      }),
    ).resolves.toEqual({
      businessId: business.id,
      role: Roles.Receptionist,
    });

    expect(verifyAccessToken(accepted.accessToken)).toMatchObject({
      userId: user.id,
      businessId: business.id,
      role: Roles.Receptionist,
    });

    await expect(
      prisma.staff.count({ where: { businessId: business.id, email } }),
    ).resolves.toBe(0);
  });
});
