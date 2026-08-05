import bcrypt from "bcryptjs";
import { Roles } from "@prisma/client";
import authService from "../src/modules/auth/auth.service";
import {
  AUTH_TOKEN_PURPOSES,
  authActionTokens,
} from "../src/modules/auth/auth-action-token.repository";
import { authSessions } from "../src/modules/auth/auth-session.service";
import { prisma } from "../src/shared/db/prisma";

const createdUserIds: string[] = [];

async function createUser() {
  const user = await prisma.businessUser.create({
    data: {
      name: "Session Security User",
      email: `session-${Date.now()}-${Math.random()}@example.com`,
      passwordHash: await bcrypt.hash("OldPassword123!", 4),
      emailVerified: true,
      role: Roles.User,
    },
  });
  createdUserIds.push(user.id);
  return user;
}

afterEach(async () => {
  if (createdUserIds.length === 0) return;
  const userIds = createdUserIds.splice(0);
  await prisma.$transaction([
    prisma.authActionToken.deleteMany({ where: { userId: { in: userIds } } }),
    prisma.authSession.deleteMany({ where: { userId: { in: userIds } } }),
    prisma.businessUser.deleteMany({ where: { id: { in: userIds } } }),
  ]);
});

describe("hardened auth sessions", () => {
  test("stores only a token hash", async () => {
    const user = await createUser();
    const rawToken = await authSessions.create(user.id);
    const stored = await prisma.authSession.findFirstOrThrow({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });

    expect(stored.tokenHash).not.toBe(rawToken);
    expect(stored.tokenHash).toMatch(/^[a-f0-9]{64}$/);
  });

  test("allows exactly one concurrent rotation", async () => {
    const user = await createUser();
    const original = await authSessions.create(user.id);

    const results = await Promise.allSettled([
      authSessions.rotate(original),
      authSessions.rotate(original),
    ]);
    const fulfilled = results.filter(
      (result): result is PromiseFulfilledResult<{ token: string; userId: string }> =>
        result.status === "fulfilled",
    );
    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatchObject({
      code: "REFRESH_ALREADY_ROTATED",
    });

    await expect(authSessions.rotate(fulfilled[0].value.token)).resolves.toEqual(
      expect.objectContaining({ userId: user.id }),
    );
  });

  test("detects delayed replay and revokes the family", async () => {
    const user = await createUser();
    const original = await authSessions.create(user.id);
    const replacement = await authSessions.rotate(original);

    await prisma.authSession.updateMany({
      where: {
        userId: user.id,
        replacedBySessionId: { not: null },
      },
      data: { revokedAt: new Date(Date.now() - 60_000) },
    });

    await expect(authSessions.rotate(original)).rejects.toMatchObject({
      code: "REFRESH_TOKEN_REUSE_DETECTED",
    });
    await expect(authSessions.rotate(replacement.token)).rejects.toMatchObject({
      code: "REFRESH_TOKEN_REUSE_DETECTED",
    });
  });

  test("consumes verification and reset tokens only once", async () => {
    const user = await createUser();
    const token = await authActionTokens.issue(
      user.id,
      AUTH_TOKEN_PURPOSES.EMAIL_VERIFICATION,
    );

    const first = await prisma.$transaction((tx) =>
      authActionTokens.consume(
        tx,
        AUTH_TOKEN_PURPOSES.EMAIL_VERIFICATION,
        token,
      ),
    );
    const second = await prisma.$transaction((tx) =>
      authActionTokens.consume(
        tx,
        AUTH_TOKEN_PURPOSES.EMAIL_VERIFICATION,
        token,
      ),
    );

    expect(first).toBe(user.id);
    expect(second).toBeNull();
  });

  test("password reset revokes all existing sessions", async () => {
    const user = await createUser();
    const oldSession = await authSessions.create(user.id);
    const resetToken = await authActionTokens.issue(
      user.id,
      AUTH_TOKEN_PURPOSES.PASSWORD_RESET,
    );

    await authService.resetPassword({
      token: resetToken,
      password: "NewPassword123!",
    });

    await expect(authSessions.rotate(oldSession)).rejects.toMatchObject({
      code: "REFRESH_TOKEN_REUSE_DETECTED",
    });
    const updated = await prisma.businessUser.findUniqueOrThrow({
      where: { id: user.id },
      select: { passwordHash: true },
    });
    expect(await bcrypt.compare("NewPassword123!", updated.passwordHash)).toBe(
      true,
    );
    expect(
      await prisma.authSession.count({
        where: { userId: user.id, revokedAt: null },
      }),
    ).toBe(0);
  });

  test("getMe returns an explicit safe DTO", async () => {
    const user = await createUser();
    const result = await authService.getMe({ userId: user.id });

    expect(result).toEqual(
      expect.objectContaining({ id: user.id, email: user.email }),
    );
    expect(result).not.toHaveProperty("passwordHash");
    expect(result).not.toHaveProperty("currentRefreshTokenId");
  });

  test("does not silently attach OAuth to an existing email account", async () => {
    const user = await createUser();

    await expect(
      authService.oauthSignIn({
        provider: "google",
        providerId: "provider-user-1",
        email: user.email,
        name: user.name,
        emailVerified: true,
      }),
    ).rejects.toMatchObject({ code: "OAUTH_ACCOUNT_LINK_REQUIRED" });
  });
});
