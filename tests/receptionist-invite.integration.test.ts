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
  test("attaches an existing registered user without creating a staff profile", async () => {
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

    await prisma.staffInvite.create({
      data: {
        businessId: business.id,
        email,
        role: Roles.Receptionist,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + 60_000),
      },
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
