import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Prisma, Roles } from "@prisma/client";
import { authActionTokens } from "../src/modules/auth/action-token.service";
import authService from "../src/modules/auth/auth.service";
import { refreshTokens } from "../src/modules/auth/refresh-token.service";
import { JWT } from "../src/shared/config/config";
import * as redis from "../src/shared/config/redis";
import { prisma } from "../src/shared/db/prisma";
import {
  hashOpaqueToken,
  signAccessToken,
  verifyAccessToken,
} from "../src/shared/utils/token.util";

const createdUserIds: string[] = [];

async function createUser(emailVerified = true) {
  const user = await prisma.businessUser.create({
    data: {
      name: "Auth Security User",
      email: `auth-${Date.now()}-${Math.random()}@example.com`,
      passwordHash: await bcrypt.hash("OldPassword123!", 4),
      emailVerified,
      role: Roles.User,
    },
  });
  createdUserIds.push(user.id);
  return user;
}

afterEach(async () => {
  jest.restoreAllMocks();
  if (createdUserIds.length === 0) return;
  const userIds = createdUserIds.splice(0);

  await prisma.businessUser.updateMany({
    where: { id: { in: userIds } },
    data: { currentRefreshTokenId: null },
  });
  await prisma.refreshToken.deleteMany({
    where: { userId: { in: userIds } },
  });
  await prisma.businessUser.deleteMany({
    where: { id: { in: userIds } },
  });
});

describe("authentication security", () => {
  test("stores only a hash of the refresh token", async () => {
    const user = await createUser();
    const rawToken = await refreshTokens.create(user.id);
    const stored = await prisma.refreshToken.findFirstOrThrow({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });

    expect(stored.token).toBe(hashOpaqueToken(rawToken));
    expect(stored.token).not.toBe(rawToken);
    expect(stored.token).toMatch(/^[a-f0-9]{64}$/);
  });

  test("allows exactly one concurrent refresh-token rotation", async () => {
    const user = await createUser();
    const original = await refreshTokens.create(user.id);

    const results = await Promise.allSettled([
      refreshTokens.rotate(original),
      refreshTokens.rotate(original),
    ]);
    const fulfilled = results.filter(
      (
        result,
      ): result is PromiseFulfilledResult<{
        token: string;
        userId: string;
      }> => result.status === "fulfilled",
    );
    const rejected = results.filter(
      (result): result is PromiseRejectedResult =>
        result.status === "rejected",
    );

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatchObject({
      code: "INVALID_REFRESH_TOKEN",
    });

    await expect(refreshTokens.rotate(fulfilled[0].value.token)).resolves.toEqual(
      expect.objectContaining({ userId: user.id }),
    );
  });

  test("auth action tokens are hashed, one-time, and remain usable if Redis fails", async () => {
    const user = await createUser(false);
    const rawToken = await authActionTokens.issue(user.id, "email_verify", 60);
    const tokenHash = hashOpaqueToken(rawToken);

    const rows = await prisma.$queryRaw<Array<{ tokenHash: string }>>(Prisma.sql`
      SELECT token_hash AS "tokenHash"
      FROM auth_action_tokens
      WHERE user_id = CAST(${user.id} AS uuid)
        AND purpose = 'email_verify'
      ORDER BY created_at DESC
      LIMIT 1
    `);
    expect(rows[0]?.tokenHash).toBe(tokenHash);
    expect(rows[0]?.tokenHash).not.toBe(rawToken);

    jest.spyOn(redis, "getDel").mockRejectedValueOnce(new Error("redis down"));
    jest.spyOn(redis, "del").mockRejectedValueOnce(new Error("redis down"));

    await expect(
      authActionTokens.consume(rawToken, "email_verify"),
    ).resolves.toBe(user.id);
    await expect(
      authActionTokens.consume(rawToken, "email_verify"),
    ).resolves.toBeNull();
  });

  test("expired auth action tokens cannot be consumed", async () => {
    const user = await createUser(false);
    const rawToken = await authActionTokens.issue(user.id, "email_verify", 60);

    await prisma.$executeRaw(Prisma.sql`
      UPDATE auth_action_tokens
      SET expires_at = ${new Date(Date.now() - 1_000)}
      WHERE token_hash = ${hashOpaqueToken(rawToken)}
    `);

    await expect(
      authActionTokens.consume(rawToken, "email_verify"),
    ).resolves.toBeNull();
  });

  test("password reset is one-time and revokes all refresh tokens", async () => {
    const user = await createUser();
    const firstSession = await refreshTokens.create(user.id);
    await refreshTokens.create(user.id);

    const resetToken = await authActionTokens.issue(user.id, "pwd_reset", 60);

    await authService.resetPassword({
      token: resetToken,
      password: "NewPassword123!",
    });

    await expect(
      authService.resetPassword({
        token: resetToken,
        password: "AnotherPassword123!",
      }),
    ).rejects.toMatchObject({ code: "INVALID_TOKEN" });
    await expect(refreshTokens.rotate(firstSession)).rejects.toMatchObject({
      code: "INVALID_REFRESH_TOKEN",
    });

    const updated = await prisma.businessUser.findUniqueOrThrow({
      where: { id: user.id },
      select: { passwordHash: true, currentRefreshTokenId: true },
    });
    expect(await bcrypt.compare("NewPassword123!", updated.passwordHash)).toBe(
      true,
    );
    expect(updated.currentRefreshTokenId).toBeNull();
    expect(
      await prisma.refreshToken.count({
        where: { userId: user.id, revoked: false },
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
    expect(result).not.toHaveProperty("refreshTokens");
  });

  test("links verified OAuth to the existing password account", async () => {
    const user = await createUser();
    const providerId = `google-${Date.now()}-${Math.random()}`;

    const result = await authService.oauthSignIn({
      provider: "google",
      providerId,
      email: user.email,
      name: "Updated OAuth Name",
      emailVerified: true,
    });

    expect(result.user.id).toBe(user.id);

    const linked = await prisma.businessUser.findUniqueOrThrow({
      where: { id: user.id },
      select: {
        provider: true,
        providerId: true,
        passwordHash: true,
      },
    });
    expect(linked.provider).toBe("google");
    expect(linked.providerId).toBe(providerId);
    expect(await bcrypt.compare("OldPassword123!", linked.passwordHash)).toBe(
      true,
    );
  });

  test("does not link an unverified OAuth email", async () => {
    const user = await createUser();

    await expect(
      authService.oauthSignIn({
        provider: "google",
        providerId: `unverified-${Date.now()}-${Math.random()}`,
        email: user.email,
        name: user.name,
        emailVerified: false,
      }),
    ).rejects.toMatchObject({ code: "OAUTH_EMAIL_NOT_VERIFIED" });
  });

  test("verifies JWT algorithm, issuer, and audience", () => {
    const valid = signAccessToken({ userId: "user-1" });
    expect(verifyAccessToken(valid)).toMatchObject({ userId: "user-1" });

    const wrongAudience = jwt.sign(
      { userId: "user-1" },
      JWT.SECRET,
      {
        algorithm: "HS256",
        issuer: JWT.ISSUER,
        audience: "another-service",
        expiresIn: "15m",
      },
    );

    expect(() => verifyAccessToken(wrongAudience)).toThrow();
  });
});
