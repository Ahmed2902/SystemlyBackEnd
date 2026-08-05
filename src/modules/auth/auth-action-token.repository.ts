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

type SqlClient = Pick<Prisma.TransactionClient, "$executeRaw" | "$queryRaw">;

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
      await tx.$executeRaw(Prisma.sql`
        UPDATE auth_action_tokens
        SET used_at = CURRENT_TIMESTAMP
        WHERE user_id = ${userId}::uuid
          AND purpose = ${purpose}
          AND used_at IS NULL
      `);
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO auth_action_tokens (
          user_id,
          purpose,
          token_hash,
          expires_at
        ) VALUES (
          ${userId}::uuid,
          ${purpose},
          ${tokenHash},
          ${expiresAt}
        )
      `);
    });

    return token;
  }

  async consume(
    client: SqlClient,
    purpose: AuthTokenPurpose,
    token: string,
  ): Promise<string | null> {
    const tokenHash = hashForPurpose(token, purpose);
    const rows = await client.$queryRaw<Array<{ user_id: string }>>(Prisma.sql`
      UPDATE auth_action_tokens
      SET used_at = CURRENT_TIMESTAMP
      WHERE token_hash = ${tokenHash}
        AND purpose = ${purpose}
        AND used_at IS NULL
        AND expires_at > CURRENT_TIMESTAMP
      RETURNING user_id
    `);

    return rows[0]?.user_id ?? null;
  }
}

export const authActionTokens = new AuthActionTokenRepository();
