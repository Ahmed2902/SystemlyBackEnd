import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import * as redis from "../../shared/config/redis";
import { prisma } from "../../shared/db/prisma";
import {
  generateOpaqueToken,
  hashOpaqueToken,
} from "../../shared/utils/token.util";

export type AuthActionPurpose = "email_verify" | "pwd_reset";

const CACHE_PREFIX = "auth_action";

function cacheKey(purpose: AuthActionPurpose, tokenHash: string) {
  return `${CACHE_PREFIX}:${purpose}:${tokenHash}`;
}

async function cacheToken(
  purpose: AuthActionPurpose,
  tokenHash: string,
  userId: string,
  ttlSeconds: number,
) {
  try {
    await redis.set(cacheKey(purpose, tokenHash), userId, ttlSeconds);
  } catch {
    // PostgreSQL is authoritative; Redis only accelerates the normal path.
  }
}

async function clearCachedToken(
  purpose: AuthActionPurpose,
  tokenHash: string,
) {
  try {
    await redis.del(cacheKey(purpose, tokenHash));
  } catch {
    // A stale cache entry cannot authorize anything without PostgreSQL consume.
  }
}

export class AuthActionTokenService {
  async issue(
    userId: string,
    purpose: AuthActionPurpose,
    ttlSeconds: number,
  ): Promise<string> {
    const rawToken = generateOpaqueToken();
    const tokenHash = hashOpaqueToken(rawToken);
    const expiresAt = new Date(Date.now() + ttlSeconds * 1_000);
    const now = new Date();

    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`
        UPDATE auth_action_tokens
        SET used_at = ${now}
        WHERE user_id = CAST(${userId} AS uuid)
          AND purpose = ${purpose}
          AND used_at IS NULL
      `);

      await tx.$executeRaw(Prisma.sql`
        INSERT INTO auth_action_tokens (
          id,
          user_id,
          purpose,
          token_hash,
          expires_at,
          created_at
        ) VALUES (
          CAST(${crypto.randomUUID()} AS uuid),
          CAST(${userId} AS uuid),
          ${purpose},
          ${tokenHash},
          ${expiresAt},
          ${now}
        )
      `);
    });

    await cacheToken(purpose, tokenHash, userId, ttlSeconds);
    return rawToken;
  }

  async consume(
    rawToken: string,
    purpose: AuthActionPurpose,
  ): Promise<string | null> {
    const tokenHash = hashOpaqueToken(rawToken);
    const now = new Date();

    // Redis is a best-effort hot path only. The atomic PostgreSQL UPDATE below
    // is always the authorization decision and guarantees one-time use.
    try {
      await redis.getDel(cacheKey(purpose, tokenHash));
    } catch {
      // Continue with PostgreSQL when Redis is unavailable.
    }

    const rows = await prisma.$queryRaw<Array<{ userId: string }>>(Prisma.sql`
      UPDATE auth_action_tokens
      SET used_at = ${now}
      WHERE token_hash = ${tokenHash}
        AND purpose = ${purpose}
        AND used_at IS NULL
        AND expires_at > ${now}
      RETURNING user_id AS "userId"
    `);

    await clearCachedToken(purpose, tokenHash);
    return rows[0]?.userId ?? null;
  }

  async wasIssuedRecently(
    userId: string,
    purpose: AuthActionPurpose,
    withinSeconds: number,
  ): Promise<boolean> {
    const threshold = new Date(Date.now() - withinSeconds * 1_000);
    const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>(Prisma.sql`
      SELECT EXISTS (
        SELECT 1
        FROM auth_action_tokens
        WHERE user_id = CAST(${userId} AS uuid)
          AND purpose = ${purpose}
          AND created_at > ${threshold}
      ) AS "exists"
    `);
    return rows[0]?.exists ?? false;
  }
}

export const authActionTokens = new AuthActionTokenService();
