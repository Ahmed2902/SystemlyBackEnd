import { Prisma } from "@prisma/client";
import { AUTH_CONSTANTS } from "../../shared/config/config";
import { prisma } from "../../shared/db/prisma";
import { createOpaqueToken, hashOpaqueToken } from "./auth-token.crypto";

export const AUTH_TOKEN_PURPOSES = {
  EMAIL_VERIFICATION: "EMAIL_VERIFICATION",
  PASSWORD_RESET: "PASSWORD_RESET",
} as const;

export type AuthTokenPurpose =
  (typeof AUTH_TOKEN_PURPOSES)[keyof typeof AUTH_TOKEN_PURPOSES];

type AuthActionTokenClient = Pick<
  Prisma.TransactionClient,
  "authActionToken"
>;

function ttlSeconds(purpose: AuthTokenPurpose): number {
  return purpose === AUTH_TOKEN_PURPOSES.EMAIL_VERIFICATION
    ? AUTH_CONSTANTS.EMAIL_TOKEN_TTL_SECONDS
    : AUTH_CONSTANTS.PWD_RESET_TTL_SECONDS;
}

function hashForPurpose(token: string, purpose: AuthTokenPurpose) {
  return hashOpaqueToken(token, `auth-action:${purpose}`);
}

export class AuthActionTokenRepository {
  async issue(userId: string, purpose: AuthTokenPurpose): Promise<string> {
    const token = createOpaqueToken();
    const tokenHash = hashForPurpose(token, purpose);
    const expiresAt = new Date(Date.now() + ttlSeconds(purpose) * 1_000);

    await prisma.$transaction(async (tx) => {
      await tx.authActionToken.updateMany({
        where: { userId, purpose, usedAt: null },
        data: { usedAt: new Date() },
      });
      await tx.authActionToken.create({
        data: { userId, purpose, tokenHash, expiresAt },
      });
    });

    return token;
  }

  async consume(
    client: AuthActionTokenClient,
    purpose: AuthTokenPurpose,
    token: string,
  ): Promise<string | null> {
    const tokenHash = hashForPurpose(token, purpose);
    const consumedAt = new Date();
    const result = await client.authActionToken.updateMany({
      where: {
        tokenHash,
        purpose,
        usedAt: null,
        expiresAt: { gt: consumedAt },
      },
      data: { usedAt: consumedAt },
    });

    if (result.count !== 1) return null;
    const consumed = await client.authActionToken.findUnique({
      where: { tokenHash },
      select: { userId: true },
    });
    return consumed?.userId ?? null;
  }
}

export const authActionTokens = new AuthActionTokenRepository();
