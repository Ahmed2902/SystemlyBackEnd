import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { AUTH_CONSTANTS } from "../../shared/config/config";
import { prisma } from "../../shared/db/prisma";
import { Errors } from "../../shared/errors/application-error";
import { createOpaqueToken, hashOpaqueToken } from "./auth-token.crypto";

const CONCURRENT_ROTATION_GRACE_MS = 10_000;

type StoredSession = {
  id: string;
  user_id: string;
  family_id: string;
  revoked: boolean;
  revoked_at: Date | null;
  replaced_by_token_id: string | null;
  expires_at: Date | null;
};

type RotationOutcome =
  | { type: "rotated"; token: string; userId: string }
  | { type: "invalid" }
  | { type: "already_rotated" }
  | { type: "reuse_detected" };

function tokenHash(token: string) {
  return hashOpaqueToken(token, "refresh-token");
}

function expiryDate() {
  return new Date(
    Date.now() + AUTH_CONSTANTS.REFRESH_TOKEN_TTL_SECONDS * 1_000,
  );
}

async function insertSession(
  tx: Prisma.TransactionClient,
  input: {
    userId: string;
    tokenHash: string;
    familyId: string;
    expiresAt: Date;
  },
) {
  const id = crypto.randomUUID();
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO refresh_tokens (
      id,
      user_id,
      token,
      family_id,
      "expiresAt",
      revoked
    ) VALUES (
      ${id}::uuid,
      ${input.userId}::uuid,
      ${input.tokenHash},
      ${input.familyId}::uuid,
      ${input.expiresAt},
      false
    )
  `);
  return id;
}

export class AuthSessionService {
  async create(userId: string): Promise<string> {
    const token = createOpaqueToken();
    const familyId = crypto.randomUUID();

    await prisma.$transaction(async (tx) => {
      const id = await insertSession(tx, {
        userId,
        tokenHash: tokenHash(token),
        familyId,
        expiresAt: expiryDate(),
      });
      await tx.businessUser.update({
        where: { id: userId },
        data: { currentRefreshTokenId: id },
      });
    });

    return token;
  }

  async rotate(token: string): Promise<{ token: string; userId: string }> {
    const hash = tokenHash(token);
    const outcome = await prisma.$transaction<RotationOutcome>(async (tx) => {
      const rows = await tx.$queryRaw<StoredSession[]>(Prisma.sql`
        SELECT
          id,
          user_id,
          family_id,
          revoked,
          revoked_at,
          replaced_by_token_id,
          "expiresAt" AS expires_at
        FROM refresh_tokens
        WHERE token = ${hash}
        FOR UPDATE
      `);
      const stored = rows[0];
      if (!stored) return { type: "invalid" };

      const expired =
        stored.expires_at != null && stored.expires_at.getTime() <= Date.now();
      if (expired) {
        await tx.$executeRaw(Prisma.sql`
          UPDATE refresh_tokens
          SET revoked = true,
              revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP)
          WHERE id = ${stored.id}::uuid
        `);
        return { type: "invalid" };
      }

      if (stored.revoked) {
        const recentlyRotated =
          stored.replaced_by_token_id != null &&
          stored.revoked_at != null &&
          Date.now() - stored.revoked_at.getTime() <=
            CONCURRENT_ROTATION_GRACE_MS;
        if (recentlyRotated) return { type: "already_rotated" };

        await tx.$executeRaw(Prisma.sql`
          UPDATE refresh_tokens
          SET revoked = true,
              revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP)
          WHERE family_id = ${stored.family_id}::uuid
        `);
        await tx.businessUser.update({
          where: { id: stored.user_id },
          data: { currentRefreshTokenId: null },
        });
        return { type: "reuse_detected" };
      }

      const replacement = createOpaqueToken();
      const replacementId = await insertSession(tx, {
        userId: stored.user_id,
        tokenHash: tokenHash(replacement),
        familyId: stored.family_id,
        expiresAt: expiryDate(),
      });

      await tx.$executeRaw(Prisma.sql`
        UPDATE refresh_tokens
        SET revoked = true,
            revoked_at = CURRENT_TIMESTAMP,
            replaced_by_token_id = ${replacementId}::uuid
        WHERE id = ${stored.id}::uuid
      `);
      await tx.businessUser.update({
        where: { id: stored.user_id },
        data: { currentRefreshTokenId: replacementId },
      });

      return {
        type: "rotated",
        token: replacement,
        userId: stored.user_id,
      };
    });

    switch (outcome.type) {
      case "rotated":
        return { token: outcome.token, userId: outcome.userId };
      case "already_rotated":
        throw Errors.unauthorized(
          "This refresh token has already been rotated.",
          "REFRESH_ALREADY_ROTATED",
        );
      case "reuse_detected":
        throw Errors.unauthorized(
          "Refresh-token reuse was detected. Sign in again.",
          "REFRESH_TOKEN_REUSE_DETECTED",
        );
      case "invalid":
        throw Errors.unauthorized(
          "Invalid or expired refresh token.",
          "INVALID_REFRESH_TOKEN",
        );
    }
  }

  async revoke(token: string): Promise<boolean> {
    const hash = tokenHash(token);
    const rows = await prisma.$queryRaw<Array<{ id: string; user_id: string }>>(
      Prisma.sql`
        UPDATE refresh_tokens
        SET revoked = true,
            revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP)
        WHERE token = ${hash}
        RETURNING id, user_id
      `,
    );
    const row = rows[0];
    if (!row) return false;

    await prisma.businessUser.updateMany({
      where: { id: row.user_id, currentRefreshTokenId: row.id },
      data: { currentRefreshTokenId: null },
    });
    return true;
  }

  async revokeAll(userId: string, tx: Prisma.TransactionClient = prisma) {
    await tx.$executeRaw(Prisma.sql`
      UPDATE refresh_tokens
      SET revoked = true,
          revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP)
      WHERE user_id = ${userId}::uuid
        AND revoked = false
    `);
    await tx.businessUser.update({
      where: { id: userId },
      data: { currentRefreshTokenId: null },
    });
  }
}

export const authSessions = new AuthSessionService();
