import "./env";

const LOCAL_DATABASE_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function parseBoolean(value: string | undefined) {
  if (value === undefined) return undefined;
  return ["1", "true", "yes"].includes(value.trim().toLowerCase());
}

/**
 * Graphile Worker accepts a connection string rather than the pg Pool
 * options used by Prisma. Encode the same TLS decision in the URL so remote
 * Supabase connections do not fall back to plaintext.
 */
export function getPgWorkerConnectionString(rawConnectionString: string) {
  const url = new URL(rawConnectionString);
  const sslMode = url.searchParams.get("sslmode")?.toLowerCase();
  const explicitSsl = parseBoolean(process.env.DATABASE_SSL_ENABLED);
  const useSsl =
    explicitSsl ??
    (sslMode !== "disable" &&
      !LOCAL_DATABASE_HOSTS.has(url.hostname.toLowerCase()));

  if (!useSsl) {
    url.searchParams.delete("sslmode");
    return url.toString();
  }

  url.searchParams.set(
    "sslmode",
    process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === "true"
      ? "verify-full"
      : "no-verify",
  );
  return url.toString();
}
