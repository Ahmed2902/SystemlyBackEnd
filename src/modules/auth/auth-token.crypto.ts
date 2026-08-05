import crypto from "node:crypto";
import { JWT } from "../../shared/config/config";

const TOKEN_BYTES = 32;

export function createOpaqueToken(): string {
  return crypto.randomBytes(TOKEN_BYTES).toString("base64url");
}

export function hashOpaqueToken(token: string, namespace: string): string {
  return crypto
    .createHmac("sha256", JWT.REFRESH_SECRET)
    .update(namespace)
    .update("\0")
    .update(token)
    .digest("hex");
}
