import { Prisma } from "@prisma/client";
import { AUTH_CONSTANTS } from "../../shared/config/config";
import { prisma } from "../../shared/db/prisma";
import { Errors } from "../../shared/errors/application-error";
import {
  generateOpaqueToken,
  hashOpaqueToken,
} from "../../shared/utils/token.util";

type RefreshTokenClient = Pick<
  Prisma.TransactionClient,
  "refreshToken" | "businessUser"
>;

function refreshExpiry(): Date {
  return new Date(
    Date.now() + AUTH_CONSTANTS.REFRESH_TOKEN_TTL_SECONDS * 1_000,
  );
}

function invalidRefreshToken() {
  return Errors.unauthorized(
    "Invalid or expired refresh token.",
    "INVALID_REFRESH_TOKEN",
  );
}

async function createForUser(
  client: RefreshTokenClient,
  userId: string,
): Promise<string> {
  const rawToken = generateOpaqueToken();
  const row = await client.refreshToken.create({
    data: {
      userId,
      token: hashOpaqueToken(rawToken),
      expiresAt: refreshExpiry(),
    },
    select: { id: true },
  });

  await client.businessUser.update({
    where: { id: userId },
    data: { currentRefreshTokenId: row.id },
  });

  return rawToken;
}

export class RefreshTokenService {
  create(userId: string): Promise<string> {
    return prisma.$transaction((tx) => createForUser(tx, userId));
  }

  async rotate(
    rawToken: string,
  ): Promise<{ token: string; userId: string }> {
    const tokenHash = hashOpaqueToken(rawToken);
    const now = new Date();

    return prisma.$transaction(async (tx) => {
      const current = await tx.refreshToken.findUnique({
        where: { token: tokenHash },
        select: {
          id: true,
          userId: true,
          revoked: true,
          expiresAt: true,
        },
      });

      if (
        !current ||
        current.revoked ||
        !current.expiresAt ||
        current.expiresAt <= now
      ) {
        throw invalidRefreshToken();
      }

      // This conditional update is the concurrency guard. When two requests
      // race, PostgreSQL allows only one of them to change revoked=false to true.
      const claimed = await tx.refreshToken.updateMany({
        where: {
          id: current.id,
          revoked: false,
          expiresAt: { gt: now },
        },
        data: { revoked: true },
      });

      if (claimed.count !== 1) {
        throw invalidRefreshToken();
      }

      return {
        token: await createForUser(tx, current.userId),
        userId: current.userId,
      };
    });
  }

  async revoke(rawToken: string): Promise<boolean> {
    const tokenHash = hashOpaqueToken(rawToken);

    return prisma.$transaction(async (tx) => {
      const stored = await tx.refreshToken.findUnique({
        where: { token: tokenHash },
        select: { id: true, userId: true },
      });
      if (!stored) return false;

      await tx.refreshToken.updateMany({
        where: { id: stored.id, revoked: false },
        data: { revoked: true },
      });
      await tx.businessUser.updateMany({
        where: {
          id: stored.userId,
          currentRefreshTokenId: stored.id,
        },
        data: { currentRefreshTokenId: null },
      });
      return true;
    });
  }

  async revokeAll(
    userId: string,
    client: RefreshTokenClient = prisma,
  ): Promise<void> {
    await client.refreshToken.updateMany({
      where: { userId, revoked: false },
      data: { revoked: true },
    });
    await client.businessUser.update({
      where: { id: userId },
      data: { currentRefreshTokenId: null },
    });
  }
}

export const refreshTokens = new RefreshTokenService();
