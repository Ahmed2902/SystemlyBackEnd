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
  revoked_at: Date | null;
  replaced_by_session_id: string | null;
  expires_at: Date;
};

type RotationOutcome =
  | { type: "rotated"; token: string; userId: string }
  | { type: "invalid" }
  | { type: "already_rotated" }
  | { type: "reuse_detected" };

type AuthSessionClient = Pick<Prisma.TransactionClient, "authSession">;

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
  const session = await tx.authSession.create({
    data: input,
    select: { id: true },
  });
  return session.id;
}

export class AuthSessionService {
  async create(userId: string): Promise<string> {
    const token = createOpaqueToken();
    await prisma.authSession.create({
      data: {
        userId,
        tokenHash: tokenHash(token),
        familyId: crypto.randomUUID(),
        expiresAt: expiryDate(),
      },
    });
    return token;
  }

  async rotate(token: string): Promise<{ token: string; userId: string }> {
    const hash = tokenHash(token);
    const outcome = await prisma.$transaction<RotationOutcome>(async (tx) => {
      // Prisma does not expose SELECT ... FOR UPDATE. The row lock is the one
      // intentional raw-SQL boundary in the session service.
      const rows = await tx.$queryRaw<StoredSession[]>(Prisma.sql`
        SELECT
          id,
          user_id,
          family_id,
          revoked_at,
          replaced_by_session_id,
          expires_at
        FROM auth_sessions
        WHERE token_hash = ${hash}
        FOR UPDATE
      `);
      const stored = rows[0];
      if (!stored) return { type: "invalid" };

      const now = new Date();
      if (stored.expires_at.getTime() <= now.getTime()) {
        await tx.authSession.update({
          where: { id: stored.id },
          data: { revokedAt: stored.revoked_at ?? now },
        });
        return { type: "invalid" };
      }

      if (stored.revoked_at) {
        const recentlyRotated =
          stored.replaced_by_session_id != null &&
          now.getTime() - stored.revoked_at.getTime() <=
            CONCURRENT_ROTATION_GRACE_MS;
        if (recentlyRotated) return { type: "already_rotated" };

        await tx.authSession.updateMany({
          where: { familyId: stored.family_id },
          data: { revokedAt: now },
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

      await tx.authSession.update({
        where: { id: stored.id },
        data: {
          revokedAt: now,
          replacedBySessionId: replacementId,
        },
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
    const stored = await prisma.authSession.findUnique({
      where: { tokenHash: tokenHash(token) },
      select: { id: true, revokedAt: true },
    });
    if (!stored) return false;
    if (!stored.revokedAt) {
      await prisma.authSession.update({
        where: { id: stored.id },
        data: { revokedAt: new Date() },
      });
    }
    return true;
  }

  async revokeAll(userId: string, client: AuthSessionClient = prisma) {
    await client.authSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}

export const authSessions = new AuthSessionService();
